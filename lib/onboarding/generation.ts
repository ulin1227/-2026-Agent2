import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  generationRuns,
  onboardingTasks,
  riskKnowledge,
  sourceReferences,
  sourceChunks,
  sourceDocuments,
  taskDependencies,
  taskRiskLinks,
} from "@/db/schema";

import { DEFAULT_CASE_ID } from "./constants";
import {
  extractFm05WithAzure,
  getAzureOpenAIModelLabel,
  type LlmExtractionResult,
  type LlmEvidence,
} from "./azureOpenAI";
import { FM05_PROMPT_VERSION } from "./fm05Prompt";
import { handoverCases } from "@/db/schema";

type DbClient = ReturnType<typeof getDb>;
type GenerationStatus = "pending" | "running" | "completed" | "failed";
type OverwriteStrategy = "replace_generated_only" | "reset_all";

export interface SourceDocumentInput {
  name: string;
  sourceType?: string;
  content: string;
  uploadedBy?: string;
}

export interface SourceDocumentRecord {
  id: string;
  caseId: string;
  name: string;
  sourceType: string;
  chunkCount: number;
  createdAt?: string;
}

export interface GenerationRunRecord {
  id: string;
  caseId: string;
  status: GenerationStatus;
  model: string | null;
  promptVersion: string | null;
  overwriteStrategy: OverwriteStrategy;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

interface GeneratedTask {
  id: string;
  title: string;
  description: string;
  status: "待處理" | "進行中" | "已完成";
  deadline: string;
  estimateHours: number;
  department: string;
  sourceDocument: string;
  isBlocking: boolean;
  riskLevel: "high" | "medium" | "low";
  crossDeptDependencyCount: number;
  llmReason: string;
  evidence: LlmEvidence[];
  prerequisites: Array<{
    taskId: string;
    dependentDept?: string;
    dependentOwner?: string;
    waitingOn?: string;
  }>;
  relatedRiskIds: string[];
}

interface GeneratedRisk {
  id: string;
  name: string;
  category: "常見錯誤" | "延期原因" | "特殊規則";
  severity: "high" | "medium" | "low";
  scenario: string;
  cause: string;
  resolution: string;
  sourceDocument: string;
  evidence: LlmEvidence[];
}

interface ExtractedPayload {
  tasks: GeneratedTask[];
  risks: GeneratedRisk[];
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function scopeGeneratedId(caseId: string, id: string) {
  return `${caseId}:${id}`;
}

async function ensureCaseExists(db: DbClient, caseId: string) {
  await db
    .insert(handoverCases)
    .values({
      id: caseId,
      title: caseId === DEFAULT_CASE_ID ? "FM05 Demo Case" : `FM05 Case ${caseId}`,
      handoverCode: null,
      status: "draft",
    })
    .onConflictDoNothing();
}

function chunkContent(content: string, chunkSize = 1200): string[] {
  const normalized = content.trim().replace(/\r\n/g, "\n");
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += chunkSize) {
    chunks.push(normalized.slice(index, index + chunkSize));
  }
  return chunks;
}

function scopeExtraction(caseId: string, extraction: LlmExtractionResult): ExtractedPayload {
  return {
    tasks: extraction.tasks.map((task) => ({
      ...task,
      id: scopeGeneratedId(caseId, task.id),
      prerequisites: task.prerequisites.map((dependency) => ({
        ...dependency,
        taskId: scopeGeneratedId(caseId, dependency.taskId),
      })),
      relatedRiskIds: task.relatedRiskIds.map((riskId) =>
        scopeGeneratedId(caseId, riskId),
      ),
    })),
    risks: extraction.risks.map((risk) => ({
      ...risk,
      id: scopeGeneratedId(caseId, risk.id),
    })),
  };
}

function mapRunRecord(
  row: typeof generationRuns.$inferSelect & { overwriteStrategy?: string | null },
): GenerationRunRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    status: row.status as GenerationStatus,
    model: row.model,
    promptVersion: row.promptVersion,
    overwriteStrategy:
      (row.overwriteStrategy as OverwriteStrategy | null) ?? "replace_generated_only",
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
  };
}

export async function ingestSourceDocument(
  input: SourceDocumentInput,
  caseId = DEFAULT_CASE_ID,
) {
  const db = getDb();
  await ensureCaseExists(db, caseId);
  const documentId = createId("src");
  const chunks = chunkContent(input.content);

  const [document] = await db
    .insert(sourceDocuments)
    .values({
      id: documentId,
      caseId,
      name: input.name,
      sourceType: input.sourceType ?? "manual-note",
      storagePath: null,
      uploadedBy: input.uploadedBy ?? "system",
    })
    .returning();

  if (chunks.length > 0) {
    await db.insert(sourceChunks).values(
      chunks.map((content, chunkIndex) => ({
        id: createId(`chunk-${chunkIndex}`),
        documentId,
        chunkIndex,
        content,
        tokenCount: content.length,
      })),
    );
  }

  return {
    id: document.id,
    caseId: document.caseId,
    name: document.name,
    sourceType: document.sourceType,
    chunkCount: chunks.length,
    createdAt: document.createdAt,
  } satisfies SourceDocumentRecord;
}

export async function listSourceDocuments(caseId = DEFAULT_CASE_ID) {
  const db = getDb();
  const documents = await db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.caseId, caseId))
    .orderBy(desc(sourceDocuments.createdAt), desc(sourceDocuments.id));

  if (documents.length === 0) {
    return [] as SourceDocumentRecord[];
  }

  const chunkRows = await db
    .select()
    .from(sourceChunks)
    .where(
      inArray(
        sourceChunks.documentId,
        documents.map((document) => document.id),
      ),
    );

  const chunkCounts = new Map<string, number>();
  for (const chunk of chunkRows) {
    chunkCounts.set(chunk.documentId, (chunkCounts.get(chunk.documentId) ?? 0) + 1);
  }

  return documents.map(
    (document) =>
      ({
        id: document.id,
        caseId: document.caseId,
        name: document.name,
        sourceType: document.sourceType,
        chunkCount: chunkCounts.get(document.id) ?? 0,
        createdAt: document.createdAt,
      }) satisfies SourceDocumentRecord,
  );
}

export async function createGenerationRun(
  options: {
    caseId?: string;
    model?: string;
    promptVersion?: string;
    overwriteStrategy?: OverwriteStrategy;
  } = {},
) {
  const db = getDb();
  const caseId = options.caseId ?? DEFAULT_CASE_ID;
  await ensureCaseExists(db, caseId);
  const [run] = await db
    .insert(generationRuns)
    .values({
      id: createId("gen"),
      caseId,
      status: "pending",
      model: options.model ?? getAzureOpenAIModelLabel(),
      promptVersion: options.promptVersion ?? FM05_PROMPT_VERSION,
      overwriteStrategy: options.overwriteStrategy ?? "replace_generated_only",
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
    })
    .returning();

  return mapRunRecord(run);
}

export async function listGenerationRuns(caseId = DEFAULT_CASE_ID) {
  const db = getDb();
  const rows = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.caseId, caseId))
    .orderBy(desc(generationRuns.createdAt), desc(generationRuns.id));

  return rows.map(mapRunRecord);
}

export async function getGenerationRun(runId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.id, runId))
    .limit(1);

  return row ? mapRunRecord(row) : null;
}

async function replaceGeneratedResults(
  db: DbClient,
  caseId: string,
  runId: string,
  extracted: ExtractedPayload,
  overwriteStrategy: OverwriteStrategy,
) {
  const existingTasks = await db
    .select({ id: onboardingTasks.id, status: onboardingTasks.status })
    .from(onboardingTasks)
    .where(eq(onboardingTasks.caseId, caseId));

  const statusMap = new Map(existingTasks.map((task) => [task.id, task.status]));
  const existingTaskReferences =
    existingTasks.length === 0
      ? []
      : await db
          .select({
            entityId: sourceReferences.entityId,
            chunkId: sourceReferences.chunkId,
            excerpt: sourceReferences.excerpt,
          })
          .from(sourceReferences)
          .where(
            and(
              eq(sourceReferences.caseId, caseId),
              eq(sourceReferences.entityType, "task"),
              inArray(
                sourceReferences.entityId,
                existingTasks.map((task) => task.id),
              ),
            ),
          );
  const evidenceKey = (chunkId: string | null, excerpt: string | null) =>
    chunkId && excerpt
      ? `${chunkId}:${excerpt.normalize("NFKC").replace(/\s+/g, " ").trim()}`
      : null;
  const statusByEvidence = new Map<string, string>();
  for (const reference of existingTaskReferences) {
    const key = evidenceKey(reference.chunkId, reference.excerpt);
    const status = statusMap.get(reference.entityId);
    if (key && status) {
      statusByEvidence.set(key, status);
    }
  }

  const statements = [];
  statements.push(db.delete(sourceReferences).where(eq(sourceReferences.caseId, caseId)));
  if (existingTasks.length > 0) {
    statements.push(db.delete(taskRiskLinks).where(
      inArray(
        taskRiskLinks.taskId,
        existingTasks.map((task) => task.id),
      ),
    ));
    statements.push(db.delete(taskDependencies).where(
      inArray(
        taskDependencies.taskId,
        existingTasks.map((task) => task.id),
      ),
    ));
  }
  statements.push(db.delete(riskKnowledge).where(eq(riskKnowledge.caseId, caseId)));
  statements.push(db.delete(onboardingTasks).where(eq(onboardingTasks.caseId, caseId)));

  for (const task of extracted.tasks) {
    const evidenceStatus = task.evidence
      .map((evidence) =>
        statusByEvidence.get(evidenceKey(evidence.sourceChunkId, evidence.excerpt) ?? ""),
      )
      .find(Boolean);
    statements.push(
      db.insert(onboardingTasks).values({
        id: task.id,
        caseId,
        generationRunId: runId,
        title: task.title,
        description: task.description,
        status:
          overwriteStrategy === "reset_all"
            ? task.status
            : ((statusMap.get(task.id) as GeneratedTask["status"] | undefined) ??
              (evidenceStatus as GeneratedTask["status"] | undefined) ??
              task.status),
        deadline: task.deadline,
        estimateHours: task.estimateHours,
        department: task.department,
        sourceDocument: task.sourceDocument,
        isBlocking: task.isBlocking,
        riskLevel: task.riskLevel,
        crossDeptDependencyCount: task.crossDeptDependencyCount,
        llmReason: task.llmReason,
      }),
    );
  }

  const dependencyRows = extracted.tasks.flatMap((task) =>
    task.prerequisites.map((dependency) => ({
      taskId: task.id,
      dependsOnTaskId: dependency.taskId,
      dependentDept: dependency.dependentDept ?? null,
      dependentOwner: dependency.dependentOwner ?? null,
      waitingOn: dependency.waitingOn ?? null,
    })),
  );

  for (const dependency of dependencyRows) {
    statements.push(db.insert(taskDependencies).values(dependency));
  }

  for (const risk of extracted.risks) {
    statements.push(
      db.insert(riskKnowledge).values({
        id: risk.id,
        caseId,
        generationRunId: runId,
        name: risk.name,
        category: risk.category,
        severity: risk.severity,
        scenario: risk.scenario,
        cause: risk.cause,
        resolution: risk.resolution,
        sourceDocument: risk.sourceDocument,
      }),
    );
  }

  const riskLinkRows = extracted.tasks.flatMap((task) =>
    task.relatedRiskIds.map((riskId) => ({ taskId: task.id, riskId })),
  );

  for (const link of riskLinkRows) {
    statements.push(db.insert(taskRiskLinks).values(link));
  }

  const referenceRows = [
    ...extracted.tasks.flatMap((task) =>
      task.evidence.map((evidence) => ({
        id: createId("ref"),
        caseId,
        entityType: "task",
        entityId: task.id,
        documentId: evidence.documentId,
        chunkId: evidence.sourceChunkId,
        excerpt: evidence.excerpt,
        confidence: evidence.confidence,
      })),
    ),
    ...extracted.risks.flatMap((risk) =>
      risk.evidence.map((evidence) => ({
        id: createId("ref"),
        caseId,
        entityType: "risk",
        entityId: risk.id,
        documentId: evidence.documentId,
        chunkId: evidence.sourceChunkId,
        excerpt: evidence.excerpt,
        confidence: evidence.confidence,
      })),
    ),
  ];
  for (const reference of referenceRows) {
    statements.push(db.insert(sourceReferences).values(reference));
  }

  if (statements.length > 0) {
    await db.batch(
      statements as [
        (typeof statements)[number],
        ...(typeof statements)[number][],
      ],
    );
  }
}

export async function executeGenerationRun(runId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.id, runId))
    .limit(1);

  if (!run) {
    throw new Error(`generation run not found: ${runId}`);
  }

  await db
    .update(generationRuns)
    .set({
      status: "running",
      startedAt: new Date().toISOString(),
      errorMessage: null,
    })
    .where(eq(generationRuns.id, runId));

  try {
    const documents = await listSourceDocuments(run.caseId);
    const dbDocuments = documents.map((document) => ({
      id: document.id,
      caseId: document.caseId,
      name: document.name,
      sourceType: document.sourceType,
      chunkCount: document.chunkCount,
      createdAt: document.createdAt,
    }));

    const chunks =
      documents.length === 0
        ? []
        : await db
            .select({
              id: sourceChunks.id,
              documentId: sourceChunks.documentId,
              chunkIndex: sourceChunks.chunkIndex,
              content: sourceChunks.content,
            })
            .from(sourceChunks)
            .where(
              inArray(
                sourceChunks.documentId,
                documents.map((document) => document.id),
              ),
            )
            .orderBy(asc(sourceChunks.documentId), asc(sourceChunks.chunkIndex));

    if (documents.length === 0 || chunks.length === 0) {
      throw new Error("generation run requires at least one non-empty source document");
    }

    const promptDocuments = dbDocuments.map((document) => ({
      id: document.id,
      name: document.name,
      chunks: chunks
        .filter((chunk) => chunk.documentId === document.id)
        .map((chunk) => ({
          id: chunk.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
        })),
    }));
    const currentDate = new Date().toISOString().slice(0, 10);
    const llmExtraction = await extractFm05WithAzure(promptDocuments, currentDate);
    const extracted = scopeExtraction(run.caseId, llmExtraction);
    await replaceGeneratedResults(
      db,
      run.caseId,
      run.id,
      extracted,
      (run.overwriteStrategy as OverwriteStrategy | null) ??
        "replace_generated_only",
    );

    await db
      .update(generationRuns)
      .set({
        status: "completed",
        finishedAt: new Date().toISOString(),
      })
      .where(eq(generationRuns.id, runId));
  } catch (error) {
    await db
      .update(generationRuns)
      .set({
        status: "failed",
        finishedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "Unexpected error",
      })
      .where(eq(generationRuns.id, runId));
    throw error;
  }

  return getGenerationRun(runId);
}
