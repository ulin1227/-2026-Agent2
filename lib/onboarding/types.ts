export type TaskStatus = "待處理" | "進行中" | "已完成";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type RiskCategory = "常見錯誤" | "延期原因" | "特殊規則";
export type RiskSeverity = "high" | "medium" | "low";

export interface SourceReference {
  id: string;
  documentId: string | null;
  chunkId: string | null;
  excerpt: string | null;
  confidence: number | null;
}

export interface Dependency {
  taskId: string;
  taskTitle: string;
  status: TaskStatus;
  dependentDept?: string;
  dependentOwner?: string;
  waitingOn?: string;
}

export interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  deadline: string;
  estimateHours: number;
  department: string;
  sourceDocument: string;
  isBlocking: boolean;
  riskLevel: RiskSeverity;
  crossDeptDependencyCount: number;
  prerequisites: Dependency[];
  priority?: Priority;
  priorityReason?: string;
  generationReason?: string;
  relatedRiskIds?: string[];
  sourceReferences?: SourceReference[];
}

export interface RiskKnowledge {
  id: string;
  name: string;
  category: RiskCategory;
  severity: RiskSeverity;
  scenario: string;
  cause: string;
  resolution: string;
  relatedTaskIds: string[];
  sourceDocument: string;
  sourceReferences?: SourceReference[];
}
