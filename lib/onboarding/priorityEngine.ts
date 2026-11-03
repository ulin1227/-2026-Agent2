import type { OnboardingTask, Priority, RiskSeverity } from "./types";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function getRemainingDays(deadline: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);

  if (!match) {
    throw new RangeError(`Invalid task deadline: ${deadline}`);
  }

  const [, year, month, day] = match;
  const deadlineDay = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const today = new Date();
  const todayDay = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  return Math.round((deadlineDay - todayDay) / MILLISECONDS_PER_DAY);
}

function getDeadlineScore(remainingDays: number): number {
  if (remainingDays <= 1) return 40;
  if (remainingDays <= 3) return 30;
  if (remainingDays <= 7) return 15;
  return 5;
}

function getRiskScore(riskLevel: RiskSeverity): number {
  if (riskLevel === "high") return 20;
  if (riskLevel === "medium") return 10;
  return 0;
}

export function computePriorityScore(task: OnboardingTask): number {
  const deadlineScore = getDeadlineScore(getRemainingDays(task.deadline));
  const blockingScore = task.isBlocking ? 25 : 0;
  const riskScore = getRiskScore(task.riskLevel);
  const dependencyScore = Math.min(
    Math.max(task.crossDeptDependencyCount, 0) * 5,
    15,
  );

  return deadlineScore + blockingScore + riskScore + dependencyScore;
}

export function scoreToPriority(score: number): Priority {
  if (score >= 70) return "P0";
  if (score >= 45) return "P1";
  if (score >= 25) return "P2";
  return "P3";
}

export function getPriorityReason(task: OnboardingTask): string {
  const remainingDays = getRemainingDays(task.deadline);
  const factors: string[] = [];

  if (remainingDays < 0) {
    factors.push(`已逾期 ${Math.abs(remainingDays)} 天`);
  } else if (remainingDays === 0) {
    factors.push("截止日為今天");
  } else if (remainingDays === 1) {
    factors.push("截止日僅剩 1 天");
  } else {
    factors.push(`截止日剩餘 ${remainingDays} 天`);
  }

  if (task.isBlocking) {
    factors.push("屬於阻斷性任務");
  }

  const riskLabels: Record<RiskSeverity, string> = {
    high: "高",
    medium: "中",
    low: "低",
  };
  factors.push(`風險程度為${riskLabels[task.riskLevel]}`);

  if (task.crossDeptDependencyCount > 0) {
    factors.push(`涉及 ${task.crossDeptDependencyCount} 個跨部門相依`);
  }

  return `${factors.join("，")}。`;
}
