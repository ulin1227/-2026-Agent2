import { and, asc, eq, inArray, like, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  onboardingTasks,
  riskKnowledge as riskKnowledgeTable,
  sourceReferences as sourceReferencesTable,
  taskDependencies,
  taskRiskLinks,
} from "@/db/schema";

import { getBlockingStatus } from "./dependencyEngine";
import { mockRisks } from "./mockRisks";
import { mockTasks } from "./mockTasks";
import {
  computePriorityScore,
  getPriorityReason,
  scoreToPriority,
} from "./priorityEngine";
import { ensureDemoCaseSeeded } from "./seed";
import { DEFAULT_CASE_ID } from "./constants";
import type {
  Dependency,
  OnboardingTask,
  Priority,
  RiskCategory,
  RiskKnowledge,
  RiskSeverity,
  SourceReference,
  TaskStatus,
} from "./types";

type EnrichedTask = OnboardingTask & {
  priority: Priority;
  priorityReason: string;
  priorityScore: number;
  blockingStatus: ReturnType<typeof getBlockingStatus>;
};

const cloneDependency = (dependency: Dependency): Dependency => ({ ...dependency });

const cloneTask = (task: OnboardingTask): OnboardingTask => ({
  ...task,
  prerequisites: task.prerequisites.map(cloneDependency),
  relatedRiskIds: task.relatedRiskIds ? [...task.relatedRiskIds] : undefined,
  sourceReferences: task.sourceReferences
    ? task.sourceReferences.map((reference) => ({ ...reference }))
    : undefined,
});

const cloneRisk = (risk: RiskKnowledge): RiskKnowledge => ({
  ...risk,
  relatedTaskIds: [...risk.relatedTaskIds],
  sourceReferences: risk.sourceReferences
    ? risk.sourceReferences.map((reference) => ({ ...reference }))
    : undefined,
});

const fallbackTasks: OnboardingTask[] = mockTasks.map(cloneTask);
const fallbackRisks: RiskKnowledge[] = mockRisks.map(cloneRisk);

function isDbUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return [
    "Cloudflare D1 binding `DB` is unavailable",
    "no such table",
    'from "onboarding_tasks"',
    'from "risk_knowledge"',
  ].some((fragment) => error.message.includes(fragment));
}

function normalizeTask(task: OnboardingTask): OnboardingTask {
  return cloneTask(task);
}

function normalizeRisk(risk: RiskKnowledge): RiskKnowledge {
  return cloneRisk(risk);
}

function enrichTasks(tasks: OnboardingTask[]): EnrichedTask[] {
  const taskStatuses = new Map(tasks.map((task) => [task.id, task.status]));

  return tasks
    .map((task) => {
      const taskWithCurrentDependencies: OnboardingTask = {
        ...task,
        prerequisites: task.prerequisites.map((prerequisite) => ({
          ...prerequisite,
          status: taskStatuses.get(prerequisite.taskId) ?? prerequisite.status,
        })),
      };
      const priorityScore = computePriorityScore(taskWithCurrentDependencies);

      return {
        ...taskWithCurrentDependencies,
        priority: scoreToPriority(priorityScore),
        priorityReason: getPriorityReason(taskWithCurrentDependencies),
        priorityScore,
        blockingStatus: getBlockingStatus(taskWithCurrentDependencies),
      };
    })
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      if (left.deadline !== right.deadline) {
        return left.deadline.localeCompare(right.deadline);
      }

      return left.title.localeCompare(right.title, "zh-Hant");
    });
}

function filterRisks(
  risks: RiskKnowledge[],
  options: {
    keyword?: string;
    category?: RiskCategory;
    severity?: RiskSeverity;
  },
): RiskKnowledge[] {
  const keyword = options.keyword?.trim().toLocaleLowerCase() ?? "";

  return risks.filter((risk) => {
    const matchesKeyword =
      keyword.length === 0 ||
      [risk.name, risk.scenario, risk.cause].some((value) =>
        value.toLocaleLowerCase().includes(keyword),
      );
    const matchesCategory =
      !options.category || risk.category === options.category;
    const matchesSeverity =
      !options.severity || risk.severity === options.severity;

    return matchesKeyword && matchesCategory && matchesSeverity;
  });
}

async function readTasksFromDb(caseId: string): Promise<OnboardingTask[]> {
  const db = getDb();
  if (caseId === DEFAULT_CASE_ID) {
    await ensureDemoCaseSeeded(db);
  }
  const rows = await db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.caseId, caseId))
    .orderBy(asc(onboardingTasks.deadline), asc(onboardingTasks.title));

  if (rows.length === 0) {
    return [];
  }

  const taskIds = rows.map((row) => row.id);
  const [dependencyRows, riskLinkRows, sourceReferenceRows] = await Promise.all([
    db
      .select()
      .from(taskDependencies)
      .where(inArray(taskDependencies.taskId, taskIds)),
    db
      .select()
      .from(taskRiskLinks)
      .where(inArray(taskRiskLinks.taskId, taskIds)),
    db
      .select()
      .from(sourceReferencesTable)
      .where(
        and(
          eq(sourceReferencesTable.caseId, caseId),
          eq(sourceReferencesTable.entityType, "task"),
          inArray(sourceReferencesTable.entityId, taskIds),
        ),
      ),
  ]);

  const dependencyMap = new Map<string, Dependency[]>();
  for (const dependency of dependencyRows) {
    const list = dependencyMap.get(dependency.taskId) ?? [];
    list.push({
      taskId: dependency.dependsOnTaskId,
      taskTitle: rows.find((row) => row.id === dependency.dependsOnTaskId)?.title ??
        dependency.dependsOnTaskId,
      status:
        (rows.find((row) => row.id === dependency.dependsOnTaskId)?.status as
          | TaskStatus
          | undefined) ?? "待處理",
      ...(dependency.dependentDept
        ? { dependentDept: dependency.dependentDept }
        : {}),
      ...(dependency.dependentOwner
        ? { dependentOwner: dependency.dependentOwner }
        : {}),
      ...(dependency.waitingOn ? { waitingOn: dependency.waitingOn } : {}),
    });
    dependencyMap.set(dependency.taskId, list);
  }

  const riskMap = new Map<string, string[]>();
  for (const link of riskLinkRows) {
    const list = riskMap.get(link.taskId) ?? [];
    list.push(link.riskId);
    riskMap.set(link.taskId, list);
  }

  const sourceReferenceMap = new Map<string, SourceReference[]>();
  for (const reference of sourceReferenceRows) {
    const list = sourceReferenceMap.get(reference.entityId) ?? [];
    list.push({
      id: reference.id,
      documentId: reference.documentId,
      chunkId: reference.chunkId,
      excerpt: reference.excerpt,
      confidence: reference.confidence,
    });
    sourceReferenceMap.set(reference.entityId, list);
  }

  return rows.map((row) =>
    normalizeTask({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status as TaskStatus,
      deadline: row.deadline,
      estimateHours: row.estimateHours,
      department: row.department,
      sourceDocument: row.sourceDocument,
      isBlocking: row.isBlocking,
      riskLevel: row.riskLevel as RiskSeverity,
      crossDeptDependencyCount: row.crossDeptDependencyCount,
      prerequisites: dependencyMap.get(row.id) ?? [],
      relatedRiskIds: riskMap.get(row.id) ?? [],
      generationReason: row.llmReason ?? undefined,
      sourceReferences: sourceReferenceMap.get(row.id) ?? [],
    }),
  );
}

async function readRisksFromDb(
  caseId: string,
  options: {
    keyword?: string;
    category?: RiskCategory;
    severity?: RiskSeverity;
  },
): Promise<RiskKnowledge[]> {
  const db = getDb();
  if (caseId === DEFAULT_CASE_ID) {
    await ensureDemoCaseSeeded(db);
  }
  const conditions = [eq(riskKnowledgeTable.caseId, caseId)];

  if (options.category) {
    conditions.push(eq(riskKnowledgeTable.category, options.category));
  }

  if (options.severity) {
    conditions.push(eq(riskKnowledgeTable.severity, options.severity));
  }

  if (options.keyword?.trim()) {
    const keyword = `%${options.keyword.trim()}%`;
    conditions.push(
      or(
        like(riskKnowledgeTable.name, keyword),
        like(riskKnowledgeTable.scenario, keyword),
        like(riskKnowledgeTable.cause, keyword),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(riskKnowledgeTable)
    .where(and(...conditions))
    .orderBy(asc(riskKnowledgeTable.severity), asc(riskKnowledgeTable.name));

  if (rows.length === 0) {
    return [];
  }

  const riskIds = rows.map((row) => row.id);
  const [riskLinks, sourceReferenceRows] = await Promise.all([
    db
      .select()
      .from(taskRiskLinks)
      .where(inArray(taskRiskLinks.riskId, riskIds)),
    db
      .select()
      .from(sourceReferencesTable)
      .where(
        and(
          eq(sourceReferencesTable.caseId, caseId),
          eq(sourceReferencesTable.entityType, "risk"),
          inArray(sourceReferencesTable.entityId, riskIds),
        ),
      ),
  ]);

  const riskToTaskIds = new Map<string, string[]>();
  for (const link of riskLinks) {
    const list = riskToTaskIds.get(link.riskId) ?? [];
    list.push(link.taskId);
    riskToTaskIds.set(link.riskId, list);
  }


  const sourceReferenceMap = new Map<string, SourceReference[]>();
  for (const reference of sourceReferenceRows) {
    const list = sourceReferenceMap.get(reference.entityId) ?? [];
    list.push({
      id: reference.id,
      documentId: reference.documentId,
      chunkId: reference.chunkId,
      excerpt: reference.excerpt,
      confidence: reference.confidence,
    });
    sourceReferenceMap.set(reference.entityId, list);
  }

  return rows.map((row) =>
    normalizeRisk({
      id: row.id,
      name: row.name,
      category: row.category as RiskCategory,
      severity: row.severity as RiskSeverity,
      scenario: row.scenario,
      cause: row.cause,
      resolution: row.resolution,
      relatedTaskIds: riskToTaskIds.get(row.id) ?? [],
      sourceDocument: row.sourceDocument,
      sourceReferences: sourceReferenceMap.get(row.id) ?? [],
    }),
  );
}

export async function listTasks(caseId = DEFAULT_CASE_ID): Promise<OnboardingTask[]> {
  try {
    return await readTasksFromDb(caseId);
  } catch (error) {
    if (isDbUnavailable(error)) {
      return caseId === DEFAULT_CASE_ID ? fallbackTasks.map(cloneTask) : [];
    }

    throw error;
  }
}

export async function listEnrichedTasks(
  caseId = DEFAULT_CASE_ID,
): Promise<EnrichedTask[]> {
  const tasks = await listTasks(caseId);
  return enrichTasks(tasks);
}

export async function listRisks(
  caseId = DEFAULT_CASE_ID,
  options: {
    keyword?: string;
    category?: RiskCategory;
    severity?: RiskSeverity;
  } = {},
): Promise<RiskKnowledge[]> {
  try {
    return await readRisksFromDb(caseId, options);
  } catch (error) {
    if (isDbUnavailable(error)) {
      return caseId === DEFAULT_CASE_ID
        ? filterRisks(fallbackRisks, options).map(cloneRisk)
        : [];
    }

    throw error;
  }
}

export async function getRiskById(
  riskId: string,
  caseId = DEFAULT_CASE_ID,
): Promise<RiskKnowledge | null> {
  const risks = await listRisks(caseId);
  return risks.find((risk) => risk.id === riskId) ?? null;
}

export async function updateTaskStatusById(
  taskId: string,
  status: TaskStatus,
  caseId = DEFAULT_CASE_ID,
): Promise<OnboardingTask> {
  try {
    const db = getDb();
    if (caseId === DEFAULT_CASE_ID) {
      await ensureDemoCaseSeeded(db);
    }
    const [updated] = await db
      .update(onboardingTasks)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(onboardingTasks.id, taskId),
          eq(onboardingTasks.caseId, caseId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error(`Onboarding task not found: ${taskId}`);
    }

    const tasks = await readTasksFromDb(updated.caseId);
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Onboarding task not found after update: ${taskId}`);
    }

    return task;
  } catch (error) {
    if (!isDbUnavailable(error)) {
      throw error;
    }

    const task =
      caseId === DEFAULT_CASE_ID
        ? fallbackTasks.find((candidate) => candidate.id === taskId)
        : undefined;
    if (!task) {
      throw new Error(`Onboarding task not found: ${taskId}`);
    }

    task.status = status;
    return cloneTask(task);
  }
}

export async function getSummary(caseId = DEFAULT_CASE_ID) {
  const tasks = await listEnrichedTasks(caseId);
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "已完成").length;
  const inProgress = tasks.filter((task) => task.status === "進行中").length;
  const pending = tasks.filter((task) => task.status === "待處理").length;
  const recommendedTask =
    tasks.find((task) => task.status !== "已完成") ?? tasks[0] ?? null;

  return {
    total,
    completed,
    inProgress,
    pending,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    recommendedTask,
  };
}
