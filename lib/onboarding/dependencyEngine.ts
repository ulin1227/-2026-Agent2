import type { OnboardingTask, TaskStatus } from "./types";

interface BlockingReason {
  taskTitle: string;
  status: TaskStatus;
  dept?: string;
  owner?: string;
  waitingOn?: string;
}

export function getBlockingStatus(task: OnboardingTask): {
  blocked: boolean;
  reasons?: BlockingReason[];
} {
  const reasons = task.prerequisites
    .filter((prerequisite) => prerequisite.status !== "已完成")
    .map(
      (prerequisite): BlockingReason => ({
        taskTitle: prerequisite.taskTitle,
        status: prerequisite.status,
        ...(prerequisite.dependentDept
          ? { dept: prerequisite.dependentDept }
          : {}),
        ...(prerequisite.dependentOwner
          ? { owner: prerequisite.dependentOwner }
          : {}),
        ...(prerequisite.waitingOn
          ? { waitingOn: prerequisite.waitingOn }
          : {}),
      }),
    );

  if (reasons.length === 0) {
    return { blocked: false };
  }

  return { blocked: true, reasons };
}
