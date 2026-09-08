CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"status" varchar(20) DEFAULT 'draft',
	"author_id" text NOT NULL,
	"tags" text[] DEFAULT '{}',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"name" varchar(100),
	"bio" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE INDEX "posts_author_status_idx" ON "posts" USING btree ("author_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");