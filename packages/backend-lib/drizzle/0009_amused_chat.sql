CREATE TABLE "QuoMessageCorrelation" (
	"messageId" text PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"userId" text NOT NULL,
	"templateId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "QuoMessageCorrelation" ADD CONSTRAINT "QuoMessageCorrelation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "QuoMessageCorrelation_workspaceId_idx" ON "QuoMessageCorrelation" USING btree ("workspaceId" uuid_ops);