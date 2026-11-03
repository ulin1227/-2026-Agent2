import type {
  Dependency,
  OnboardingTask,
  RiskKnowledge,
  TaskStatus,
} from "./types";
import { DEFAULT_CASE_ID } from "./constants";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

export async function fetchTasks(): Promise<OnboardingTask[]> {
  const response = await fetch(`/api/onboarding/tasks?caseId=${DEFAULT_CASE_ID}`, {
    cache: "no-store",
  });
  const payload = await readJson<{ tasks: OnboardingTask[] }>(response);
  return payload.tasks;
}

export async function fetchRisks(): Promise<RiskKnowledge[]> {
  const response = await fetch(`/api/onboarding/risks?caseId=${DEFAULT_CASE_ID}`, {
    cache: "no-store",
  });
  const payload = await readJson<{ risks: RiskKnowledge[] }>(response);
  return payload.risks;
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<void> {
  const response = await fetch(`/api/onboarding/tasks/${id}?caseId=${DEFAULT_CASE_ID}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ status }),
  });

  await readJson<{ task: OnboardingTask }>(response);
}

export type {
  Dependency,
  OnboardingTask,
  Priority,
  RiskCategory,
  RiskKnowledge,
  RiskSeverity,
  TaskStatus,
} from "./types";
