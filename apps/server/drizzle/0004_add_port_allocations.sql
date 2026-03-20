CREATE TABLE `port_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace` text NOT NULL,
	`base_port` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `port_allocations_project_id_workspace_unique` ON `port_allocations` (`project_id`,`workspace`);
