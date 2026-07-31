CREATE TABLE `rag_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`document_id` text NOT NULL,
	`text` text NOT NULL,
	`metadata_json` text NOT NULL,
	`embedding_json` text,
	`embedding_model` text,
	`indexed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rag_chunks_project_idx` ON `rag_chunks` (`project_id`);--> statement-breakpoint
CREATE INDEX `rag_chunks_project_document_idx` ON `rag_chunks` (`project_id`,`document_id`);--> statement-breakpoint
CREATE TABLE `rag_documents` (
	`document_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_key` text NOT NULL,
	`object_key` text NOT NULL,
	`relative_path` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`modified_at` text NOT NULL,
	`checksum` text NOT NULL,
	`version` text,
	`indexed_at` text NOT NULL,
	`chunk_count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rag_documents_project_source_idx` ON `rag_documents` (`project_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `rag_documents_project_path_idx` ON `rag_documents` (`project_id`,`relative_path`);