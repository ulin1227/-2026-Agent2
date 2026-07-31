import { eq } from "drizzle-orm";

import {
  generationRuns,
  handoverCases,
  onboardingTasks,
  riskKnowledge,
  sourceDocuments,
  taskDependencies,
  taskRiskLinks,
} from "@/db/schema";
import { getDb } from "@/db";

import { DEFAULT_CASE_ID } from "./constants";
import { mockRisks } from "./mockRisks";
import { mockTasks } from "./mockTasks";

type DbClient = ReturnType<typeof getDb>;

const DEMO_GENERATION_RUN_ID = "fm05-demo-run-001";

function scopeSeedId(caseId: string, id: string) {
  return caseId === DEFAULT_CASE_ID ? id : `${caseId}:${id}`;
}

function toStableIdFragment(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function buildSourceDocumentRows(caseId: string) {
  const names = new Set<string>();

  for (const task of mockTasks) {
    names.add(task.sourceDocument);
  }

  for (const risk of mockRisks) {
    names.add(risk.sourceDocument);
  }

  return [...names].map((name) => ({
    id: scopeSeedId(caseId, `src-${toStableIdFragment(name) || "document"}`),
    caseId,
    name,
    sourceType: "mock-seed",
    storagePath: null,
    uploadedBy: "system",
  }));
}

export async function ensureDemoCaseSeeded(
  db: DbClient,
  caseId = DEFAULT_CASE_ID,
): Promise<{ seeded: boolean; taskCount: number; riskCount: number }> {
  const existingTasks = await db
    .select({ id: onboardingTasks.id })
    .from(onboardingTasks)
    .where(eq(onboardingTasks.caseId, caseId));

  if (existingTasks.length > 0) {
    const riskCount = await db
      .select({ id: riskKnowledge.id })
      .from(riskKnowledge)
      .where(eq(riskKnowledge.caseId, caseId));

    return {
      seeded: false,
      taskCount: existingTasks.length,
      riskCount: riskCount.length,
    };
  }

  await db
    .insert(handoverCases)
    .values({
      id: caseId,
      title: "FM05 Demo Case",
      handoverCode: "FM0501",
      status: "ready",
    })
    .onConflictDoNothing();

  await db
    .insert(generationRuns)
    .values({
      id: scopeSeedId(caseId, DEMO_GENERATION_RUN_ID),
      caseId,
      status: "completed",
      model: "mock-seed",
      promptVersion: "fm05-demo-v1",
      overwriteStrategy: "replace_generated_only",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();

  const sourceRows = buildSourceDocumentRows(caseId);
  if (sourceRows.length > 0) {
    await db.insert(sourceDocuments).values(sourceRows).onConflictDoNothing();
  }

  for (const task of mockTasks) {
    await db
      .insert(onboardingTasks)
      .values({
        id: scopeSeedId(caseId, task.id),
        caseId,
        generationRunId: scopeSeedId(caseId, DEMO_GENERATION_RUN_ID),
        title: task.title,
        description: task.description,
        status: task.status,
        deadline: task.deadline,
        estimateHours: task.estimateHours,
        department: task.department,
        sourceDocument: task.sourceDocument,
        isBlocking: task.isBlocking,
        riskLevel: task.riskLevel,
        crossDeptDependencyCount: task.crossDeptDependencyCount,
        llmReason: task.priorityReason ?? null,
      })
      .onConflictDoNothing();
  }

  const dependencyRows = mockTasks.flatMap((task) =>
    task.prerequisites.map((dependency) => ({
      taskId: scopeSeedId(caseId, task.id),
      dependsOnTaskId: scopeSeedId(caseId, dependency.taskId),
      dependentDept: dependency.dependentDept ?? null,
      dependentOwner: dependency.dependentOwner ?? null,
      waitingOn: dependency.waitingOn ?? null,
    })),
  );

  if (dependencyRows.length > 0) {
    await db.insert(taskDependencies).values(dependencyRows).onConflictDoNothing();
  }

  await db
    .insert(riskKnowledge)
    .values(
      mockRisks.map((risk) => ({
        id: scopeSeedId(caseId, risk.id),
        caseId,
        generationRunId: scopeSeedId(caseId, DEMO_GENERATION_RUN_ID),
        name: risk.name,
        category: risk.category,
        severity: risk.severity,
        scenario: risk.scenario,
        cause: risk.cause,
        resolution: risk.resolution,
        sourceDocument: risk.sourceDocument,
      })),
    )
    .onConflictDoNothing();

  const taskRiskRows = mockTasks.flatMap((task) =>
    (task.relatedRiskIds ?? []).map((riskId) => ({
      taskId: scopeSeedId(caseId, task.id),
      riskId: scopeSeedId(caseId, riskId),
    })),
  );

  if (taskRiskRows.length > 0) {
    await db.insert(taskRiskLinks).values(taskRiskRows).onConflictDoNothing();
  }

  return {
    seeded: true,
    taskCount: mockTasks.length,
    riskCount: mockRisks.length,
  };
}
