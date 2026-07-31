import {
  buildFm05UserPrompt,
  FM05_SYSTEM_PROMPT,
  type PromptSourceDocument,
} from "./fm05Prompt";

export interface AzureOpenAIConfig {
  endpoint?: string;
  apiKey?: string;
  deployment?: string;
  apiVersion?: string;
  model?: string;
  timeoutMs?: string;
}

export interface LlmEvidence {
  sourceDocument: string;
  sourceChunkId: string;
  excerpt: string;
  confidence: number;
  documentId: string;
}

export interface LlmTask {
  id: string;
  title: string;
  description: string;
  status: "待處理";
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

export interface LlmRisk {
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

export interface LlmExtractionResult {
  tasks: LlmTask[];
  risks: LlmRisk[];
}

let runtimeConfig: AzureOpenAIConfig = {};

export function setAzureOpenAIConfig(config: AzureOpenAIConfig) {
  runtimeConfig = config;
}

export function getAzureOpenAIModelLabel() {
  return (
    runtimeConfig.model?.trim() ||
    readProcessEnv("AZURE_OPENAI_MODEL")?.trim() ||
    "gpt-4o"
  );
}

function readProcessEnv(name: string) {
  return typeof process === "undefined" ? undefined : process.env[name];
}

function requiredConfig(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Azure OpenAI configuration is missing: ${name}`);
  }
  return normalized;
}

function getConfig() {
  const endpoint = requiredConfig(
    runtimeConfig.endpoint ?? readProcessEnv("AZURE_OPENAI_ENDPOINT"),
    "AZURE_OPENAI_ENDPOINT",
  ).replace(/\/+$/, "");
  const timeoutValue =
    runtimeConfig.timeoutMs ?? readProcessEnv("FM05_LLM_TIMEOUT_MS") ?? "60000";
  const timeoutMs = Number(timeoutValue);

  if (!endpoint.startsWith("https://")) {
    throw new Error("AZURE_OPENAI_ENDPOINT must use https://");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000) {
    throw new Error("FM05_LLM_TIMEOUT_MS must be between 1000 and 180000");
  }

  return {
    endpoint,
    apiKey: requiredConfig(
      runtimeConfig.apiKey ?? readProcessEnv("AZURE_OPENAI_API_KEY"),
      "AZURE_OPENAI_API_KEY",
    ),
    deployment: requiredConfig(
      runtimeConfig.deployment ?? readProcessEnv("AZURE_OPENAI_DEPLOYMENT"),
      "AZURE_OPENAI_DEPLOYMENT",
    ),
    apiVersion: requiredConfig(
      runtimeConfig.apiVersion ?? readProcessEnv("AZURE_OPENAI_API_VERSION"),
      "AZURE_OPENAI_API_VERSION",
    ),
    timeoutMs,
  };
}

function stringField(value: unknown, path: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Azure OpenAI returned an invalid ${path}`);
  }
  return value.trim();
}

function idField(value: unknown, prefix: "task" | "risk" | "dependency", path: string) {
  const rawId = stringField(value, path);
  let fragment = rawId
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!fragment) {
    fragment = Array.from(rawId)
      .map((character) => character.codePointAt(0)?.toString(36) ?? "0")
      .join("-");
  }

  if (prefix === "dependency") {
    return fragment.startsWith("external-") || fragment.startsWith("task-")
      ? fragment
      : `task-${fragment}`;
  }

  return fragment.startsWith(`${prefix}-`) ? fragment : `${prefix}-${fragment}`;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function enumField<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Azure OpenAI returned an invalid ${path}`);
  }
  return value as T;
}

function integerField(value: unknown, min: number, max: number, path: string) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`Azure OpenAI returned an invalid ${path}`);
  }
  return value as number;
}

function sourceDocumentField(value: unknown, documentNames: Set<string>, path: string) {
  const name = stringField(value, path);
  if (!documentNames.has(name)) {
    throw new Error(`Azure OpenAI referenced an unknown source document: ${name}`);
  }
  return name;
}

function normalizeEvidenceText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function evidenceField(
  value: unknown,
  documents: PromptSourceDocument[],
  path: string,
): LlmEvidence[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new Error(`Azure OpenAI returned an invalid ${path}`);
  }

  const documentNames = new Set(documents.map((document) => document.name));
  const chunks = new Map(
    documents.flatMap((document) =>
      document.chunks.map((chunk) => [
        chunk.id,
        { ...chunk, documentId: document.id, documentName: document.name },
      ] as const),
    ),
  );

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Azure OpenAI returned an invalid ${path}[${index}]`);
    }
    const evidence = item as Record<string, unknown>;
    const sourceDocument = sourceDocumentField(
      evidence.sourceDocument,
      documentNames,
      `${path}[${index}].sourceDocument`,
    );
    const sourceChunkId = stringField(
      evidence.sourceChunkId,
      `${path}[${index}].sourceChunkId`,
    );
    const excerpt = stringField(evidence.excerpt, `${path}[${index}].excerpt`);
    const chunk = chunks.get(sourceChunkId);

    if (!chunk || chunk.documentName !== sourceDocument) {
      throw new Error(`Azure OpenAI referenced an unknown source chunk: ${sourceChunkId}`);
    }
    if (excerpt.length > 240) {
      throw new Error(`Azure OpenAI returned an oversized ${path}[${index}].excerpt`);
    }
    if (!normalizeEvidenceText(chunk.content).includes(normalizeEvidenceText(excerpt))) {
      throw new Error(`Azure OpenAI excerpt was not found in source chunk: ${sourceChunkId}`);
    }

    return {
      sourceDocument,
      sourceChunkId,
      excerpt,
      confidence: integerField(
        evidence.confidence,
        0,
        100,
        `${path}[${index}].confidence`,
      ),
      documentId: chunk.documentId,
    };
  });
}

function parseExtraction(value: unknown, documents: PromptSourceDocument[]): LlmExtractionResult {
  if (!value || typeof value !== "object") {
    throw new Error("Azure OpenAI response is not a JSON object");
  }

  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.tasks) || !Array.isArray(root.risks)) {
    throw new Error("Azure OpenAI response must contain tasks and risks arrays");
  }
  if (root.tasks.length > 12 || root.risks.length > 10) {
    throw new Error("Azure OpenAI response exceeded the FM05 item limit");
  }

  const documentNames = new Set(documents.map((document) => document.name));
  const rawRisks = root.risks.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Azure OpenAI returned an invalid risks[${index}]`);
    }
    const risk = item as Record<string, unknown>;
    return {
      id: idField(risk.id, "risk", `risks[${index}].id`),
      name: stringField(risk.name, `risks[${index}].name`),
      category: enumField(
        risk.category,
        ["常見錯誤", "延期原因", "特殊規則"] as const,
        `risks[${index}].category`,
      ),
      severity: enumField(
        risk.severity,
        ["high", "medium", "low"] as const,
        `risks[${index}].severity`,
      ),
      scenario: stringField(risk.scenario, `risks[${index}].scenario`),
      cause: stringField(risk.cause, `risks[${index}].cause`),
      resolution: stringField(risk.resolution, `risks[${index}].resolution`),
      sourceDocument: sourceDocumentField(
        risk.sourceDocument,
        documentNames,
        `risks[${index}].sourceDocument`,
      ),
      evidence: evidenceField(risk.evidence, documents, `risks[${index}].evidence`),
    } satisfies LlmRisk;
  });

  const riskIds = new Set(rawRisks.map((risk) => risk.id));
  if (riskIds.size !== rawRisks.length) {
    throw new Error("Azure OpenAI returned duplicate risk ids");
  }

  const rawTasks = root.tasks.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Azure OpenAI returned an invalid tasks[${index}]`);
    }
    const task = item as Record<string, unknown>;
    if (!Array.isArray(task.prerequisites) || !Array.isArray(task.relatedRiskIds)) {
      throw new Error(`Azure OpenAI returned invalid task links at tasks[${index}]`);
    }

    const deadline = stringField(task.deadline, `tasks[${index}].deadline`);
    const parsedDeadline = new Date(`${deadline}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(deadline) ||
      Number.isNaN(parsedDeadline.getTime()) ||
      parsedDeadline.toISOString().slice(0, 10) !== deadline
    ) {
      throw new Error(`Azure OpenAI returned an invalid tasks[${index}].deadline`);
    }

    const relatedRiskIds = task.relatedRiskIds.map((riskId, riskIndex) => {
      const id = idField(
        riskId,
        "risk",
        `tasks[${index}].relatedRiskIds[${riskIndex}]`,
      );
      if (!riskIds.has(id)) {
        throw new Error(`Azure OpenAI task referenced an unknown risk id: ${id}`);
      }
      return id;
    });

    return {
      id: idField(task.id, "task", `tasks[${index}].id`),
      title: stringField(task.title, `tasks[${index}].title`),
      description: stringField(task.description, `tasks[${index}].description`),
      status: enumField(task.status, ["待處理"] as const, `tasks[${index}].status`),
      deadline,
      estimateHours: integerField(
        task.estimateHours,
        1,
        80,
        `tasks[${index}].estimateHours`,
      ),
      department: stringField(task.department, `tasks[${index}].department`),
      sourceDocument: sourceDocumentField(
        task.sourceDocument,
        documentNames,
        `tasks[${index}].sourceDocument`,
      ),
      isBlocking:
        typeof task.isBlocking === "boolean"
          ? task.isBlocking
          : (() => {
              throw new Error(`Azure OpenAI returned an invalid tasks[${index}].isBlocking`);
            })(),
      riskLevel: enumField(
        task.riskLevel,
        ["high", "medium", "low"] as const,
        `tasks[${index}].riskLevel`,
      ),
      crossDeptDependencyCount: integerField(
        task.crossDeptDependencyCount,
        0,
        20,
        `tasks[${index}].crossDeptDependencyCount`,
      ),
      llmReason: stringField(task.llmReason, `tasks[${index}].llmReason`),
      evidence: evidenceField(task.evidence, documents, `tasks[${index}].evidence`),
      prerequisites: task.prerequisites.map((item, dependencyIndex) => {
        if (!item || typeof item !== "object") {
          throw new Error(
            `Azure OpenAI returned an invalid tasks[${index}].prerequisites[${dependencyIndex}]`,
          );
        }
        const dependency = item as Record<string, unknown>;
        return {
          taskId: idField(
            dependency.taskId,
            "dependency",
            `tasks[${index}].prerequisites[${dependencyIndex}].taskId`,
          ),
          dependentDept: optionalString(dependency.dependentDept),
          dependentOwner: optionalString(dependency.dependentOwner),
          waitingOn: optionalString(dependency.waitingOn),
        };
      }),
      relatedRiskIds,
    } satisfies LlmTask;
  });

  const taskIds = new Set(rawTasks.map((task) => task.id));
  if (taskIds.size !== rawTasks.length) {
    throw new Error("Azure OpenAI returned duplicate task ids");
  }
  for (const task of rawTasks) {
    if (!task.evidence.some((evidence) => evidence.sourceDocument === task.sourceDocument)) {
      throw new Error(`Azure OpenAI task evidence does not support source document: ${task.id}`);
    }
    for (const dependency of task.prerequisites) {
      if (!dependency.taskId.startsWith("external-") && !taskIds.has(dependency.taskId)) {
        throw new Error(`Azure OpenAI task referenced an unknown prerequisite: ${dependency.taskId}`);
      }
      if (dependency.taskId === task.id) {
        throw new Error(`Azure OpenAI task cannot depend on itself: ${task.id}`);
      }
    }
  }
  for (const risk of rawRisks) {
    if (!risk.evidence.some((evidence) => evidence.sourceDocument === risk.sourceDocument)) {
      throw new Error(`Azure OpenAI risk evidence does not support source document: ${risk.id}`);
    }
  }

  const dependencyMap = new Map(
    rawTasks.map((task) => [
      task.id,
      task.prerequisites
        .map((dependency) => dependency.taskId)
        .filter((id) => taskIds.has(id)),
    ]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string) => {
    if (visiting.has(taskId)) {
      throw new Error(`Azure OpenAI returned a circular task dependency: ${taskId}`);
    }
    if (visited.has(taskId)) {
      return;
    }
    visiting.add(taskId);
    for (const dependencyId of dependencyMap.get(taskId) ?? []) {
      visit(dependencyId);
    }
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const taskId of taskIds) {
    visit(taskId);
  }

  return { tasks: rawTasks, risks: rawRisks };
}

interface AzureChatResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
}

export async function extractFm05WithAzure(
  documents: PromptSourceDocument[],
  currentDate: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<LlmExtractionResult> {
  const config = getConfig();
  let remainingCharacters = 80000;
  const promptDocuments = documents
    .map((document) => ({
      ...document,
      chunks: document.chunks
        .map((chunk) => {
          const content = chunk.content.slice(0, Math.max(remainingCharacters, 0));
          remainingCharacters -= content.length;
          return { ...chunk, content };
        })
        .filter((chunk) => chunk.content.trim()),
    }))
    .filter((document) => document.chunks.length > 0);
  if (promptDocuments.length === 0) {
    throw new Error("FM05 extraction requires at least one non-empty source document");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(config.deployment)}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;

  try {
    const response = await fetchImplementation(url, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: FM05_SYSTEM_PROMPT },
          { role: "user", content: buildFm05UserPrompt(promptDocuments, currentDate) },
        ],
        temperature: 0,
        max_tokens: 6000,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => ({}))) as AzureChatResponse;
    if (!response.ok) {
      const detail = body.error?.message?.slice(0, 500) ?? `HTTP ${response.status}`;
      throw new Error(`Azure OpenAI request failed: ${detail}`);
    }

    const choice = body.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error("Azure OpenAI returned no message content");
    }
    if (choice.finish_reason && choice.finish_reason !== "stop") {
      throw new Error(`Azure OpenAI response was incomplete: ${choice.finish_reason}`);
    }

    return parseExtraction(JSON.parse(choice.message.content), promptDocuments);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Azure OpenAI request timed out after ${config.timeoutMs}ms`);
    }
    if (error instanceof SyntaxError) {
      throw new Error("Azure OpenAI returned malformed JSON");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
