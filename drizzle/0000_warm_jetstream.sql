CREATE TABLE `generation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`model` text,
	`prompt_version` text,
	`started_at` text,
	`finished_at` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `handover_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `handover_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`handover_code` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `onboarding_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`generation_run_id` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`deadline` text NOT NULL,
	`estimate_hours` integer NOT NULL,
	`department` text NOT NULL,
	`source_document` text NOT NULL,
	`is_blocking` integer DEFAULT false NOT NULL,
	`risk_level` text NOT NULL,
	`cross_dept_dependency_count` integer DEFAULT 0 NOT NULL,
	`llm_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `handover_cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `risk_knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`generation_run_id` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`scenario` text NOT NULL,
	`cause` text NOT NULL,
	`resolution` text NOT NULL,
	`source_document` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `handover_cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`token_count` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`name` text NOT NULL,
	`source_type` text DEFAULT 'other' NOT NULL,
	`storage_path` text,
	`uploaded_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `handover_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_references` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`document_id` text,
	`chunk_id` text,
	`excerpt` text,
	`confidence` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `handover_cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chunk_id`) REFERENCES `source_chunks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`depends_on_task_id` text NOT NULL,
	`dependent_dept` text,
	`dependent_owner` text,
	`waiting_on` text,
	FOREIGN KEY (`task_id`) REFERENCES `onboarding_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_risk_links` (
	`task_id` text NOT NULL,
	`risk_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `risk_id`),
	FOREIGN KEY (`task_id`) REFERENCES `onboarding_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`risk_id`) REFERENCES `risk_knowledge`(`id`) ON UPDATE no action ON DELETE no action
);
