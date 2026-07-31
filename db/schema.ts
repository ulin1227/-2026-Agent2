import { sql } from "drizzle-orm";
import {
  integer,
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_sessions_user_id").on(table.userId)],
);

export const handoverCases = sqliteTable("handover_cases", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  handoverCode: text("handover_code"),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const handoverCaseMembers = sqliteTable(
  "handover_case_members",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => handoverCases.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.userId] }),
    index("idx_handover_case_members_user").on(table.userId),
    uniqueIndex("idx_handover_case_members_case_user_role").on(
      table.caseId,
      table.userId,
      table.role,
    ),
  ],
);

export const sourceDocuments = sqliteTable("source_documents", {
  id: text("id").primaryKey(),
  caseId: text("case_id")
    .notNull()
    .references(() => handoverCases.id),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull().default("other"),
  storagePath: text("storage_path"),
  uploadedBy: text("uploaded_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sourceChunks = sqliteTable("source_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => sourceDocuments.id),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  tokenCount: integer("token_count"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const generationRuns = sqliteTable("generation_runs", {
  id: text("id").primaryKey(),
  caseId: text("case_id")
    .notNull()
    .references(() => handoverCases.id),
  status: text("status").notNull().default("pending"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  overwriteStrategy: text("overwrite_strategy")
    .notNull()
    .default("replace_generated_only"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const onboardingTasks = sqliteTable("onboarding_tasks", {
  id: text("id").primaryKey(),
  caseId: text("case_id")
    .notNull()
    .references(() => handoverCases.id),
  generationRunId: text("generation_run_id").references(() => generationRuns.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),
  deadline: text("deadline").notNull(),
  estimateHours: integer("estimate_hours").notNull(),
  department: text("department").notNull(),
  sourceDocument: text("source_document").notNull(),
  isBlocking: integer("is_blocking", { mode: "boolean" }).notNull().default(false),
  riskLevel: text("risk_level").notNull(),
  crossDeptDependencyCount: integer("cross_dept_dependency_count")
    .notNull()
    .default(0),
  llmReason: text("llm_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const taskDependencies = sqliteTable("task_dependencies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: text("task_id")
    .notNull()
    .references(() => onboardingTasks.id),
  dependsOnTaskId: text("depends_on_task_id").notNull(),
  dependentDept: text("dependent_dept"),
  dependentOwner: text("dependent_owner"),
  waitingOn: text("waiting_on"),
});

export const riskKnowledge = sqliteTable("risk_knowledge", {
  id: text("id").primaryKey(),
  caseId: text("case_id")
    .notNull()
    .references(() => handoverCases.id),
  generationRunId: text("generation_run_id").references(() => generationRuns.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  scenario: text("scenario").notNull(),
  cause: text("cause").notNull(),
  resolution: text("resolution").notNull(),
  sourceDocument: text("source_document").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const taskRiskLinks = sqliteTable(
  "task_risk_links",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => onboardingTasks.id),
    riskId: text("risk_id")
      .notNull()
      .references(() => riskKnowledge.id),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.riskId] })],
);

export const sourceReferences = sqliteTable(
  "source_references",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => handoverCases.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    documentId: text("document_id").references(() => sourceDocuments.id),
    chunkId: text("chunk_id").references(() => sourceChunks.id),
    excerpt: text("excerpt"),
    confidence: integer("confidence"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_source_references_case_entity").on(
      table.caseId,
      table.entityType,
      table.entityId,
    ),
  ],
);
