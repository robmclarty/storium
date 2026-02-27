PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`body` text,
	`status` text DEFAULT 'draft',
	`author_id` text,
	`tags` text DEFAULT '[]',
	`metadata` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "title", "body", "status", "author_id", "tags", "metadata", "created_at", "updated_at") SELECT "id", "title", "body", "status", "author_id", "tags", "metadata", "created_at", "updated_at" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `posts_author_status_idx` ON `posts` (`author_id`,`status`);