CREATE TYPE "public"."agent_kind" AS ENUM('orchestrator', 'research', 'spawned', 'you');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('idle', 'busy', 'done');--> statement-breakpoint
CREATE TYPE "public"."authored_by" AS ENUM('you', 'agent');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('message', 'activity');--> statement-breakpoint
CREATE TYPE "public"."step_state" AS ENUM('ok', 'run', 'spawn');--> statement-breakpoint
CREATE TYPE "public"."thread_group" AS ENUM('Active', 'Recent');--> statement-breakpoint
CREATE TABLE "agent_skills" (
	"agent_id" text NOT NULL,
	"skill_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"color" text NOT NULL,
	"kind" "agent_kind" NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "agent_status" DEFAULT 'idle' NOT NULL,
	"status_label" text DEFAULT 'Idle' NOT NULL,
	"instances" integer DEFAULT 1 NOT NULL,
	"spawned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"thread_id" text NOT NULL,
	"author_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"seq" integer NOT NULL,
	"author_id" text,
	"tag" text,
	"paragraphs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"doc_id" text,
	"label" text,
	"bars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"author_id" text NOT NULL,
	"authored_by" "authored_by" NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "steps" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"group_label" text NOT NULL,
	"seq" integer NOT NULL,
	"state" "step_state" NOT NULL,
	"name" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"duration_ms" integer,
	"parent_id" text,
	"badge" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group" "thread_group" DEFAULT 'Active' NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"unread" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_author_id_agents_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_author_id_agents_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_author_id_agents_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_skills_pair" ON "agent_skills" USING btree ("agent_id","skill_id");