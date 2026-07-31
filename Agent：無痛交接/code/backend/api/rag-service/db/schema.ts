import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ragRetrievalLogs = sqliteTable("rag_retrieval_logs", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  actorEmail: text("actor_email"),
  projectId: text("project_id").notNull(),
  question: text("question").notNull(),
  strategy: text("strategy").notNull(),
  topK: integer("top_k").notNull(),
  resultCount: integer("result_count").notNull(),
  latencyMs: real("latency_ms").notNull(),
  queryType: text("query_type"),
  lexicalWeight: real("lexical_weight"),
  vectorWeight: real("vector_weight"),
  citationsJson: text("citations_json").notNull(),
}, (table) => [
  index("rag_retrieval_logs_project_created_idx").on(table.projectId, table.createdAt),
]);

export const ragDocuments = sqliteTable("rag_documents", {
  documentId: text("document_id").primaryKey(),
  projectId: text("project_id").notNull(),
  sourceKey: text("source_key").notNull(),
  objectKey: text("object_key").notNull(),
  relativePath: text("relative_path").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  modifiedAt: text("modified_at").notNull(),
  checksum: text("checksum").notNull(),
  version: text("version"),
  indexedAt: text("indexed_at").notNull(),
  chunkCount: integer("chunk_count").notNull(),
}, (table) => [
  index("rag_documents_project_source_idx").on(table.projectId, table.sourceKey),
  index("rag_documents_project_path_idx").on(table.projectId, table.relativePath),
]);

export const ragChunks = sqliteTable("rag_chunks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  documentId: text("document_id").notNull(),
  text: text("text").notNull(),
  metadataJson: text("metadata_json").notNull(),
  embeddingJson: text("embedding_json"),
  embeddingModel: text("embedding_model"),
  indexedAt: text("indexed_at").notNull(),
}, (table) => [
  index("rag_chunks_project_idx").on(table.projectId),
  index("rag_chunks_project_document_idx").on(table.projectId, table.documentId),
]);
