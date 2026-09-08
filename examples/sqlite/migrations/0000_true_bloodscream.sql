CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`status` text DEFAULT 'draft',
	`author_id` text NOT NULL,
	`tags` text DEFAULT '[]',
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `posts_author_status_idx` ON `posts` (`author_id`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`name` text,
	`bio` text,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);