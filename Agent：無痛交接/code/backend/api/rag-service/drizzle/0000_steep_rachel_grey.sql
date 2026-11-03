CREATE TABLE `rag_retrieval_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`actor_email` text,
	`project_id` text NOT NULL,
	`question` text NOT NULL,
	`strategy` text NOT NULL,
	`top_k` integer NOT NULL,
	`result_count` integer NOT NULL,
	`latency_ms` real NOT NULL,
	`query_type` text,
	`lexical_weight` real,
	`vector_weight` real,
	`citations_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rag_retrieval_logs_project_created_idx` ON `rag_retrieval_logs` (`project_id`,`created_at`);