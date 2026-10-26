CREATE TABLE "PostalMessageMappings" (
	"postalMessageId" bigint PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"userId" text NOT NULL,
	"messageId" text NOT NULL,
	"templateId" text,
	"journeyId" text,
	"nodeId" text,
	"broadcastId" text,
	"runId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "PostalMessageMappings" ADD CONSTRAINT "PostalMessageMappings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "PostalMessageMappings_workspaceId_idx" ON "PostalMessageMappings" USING btree ("workspaceId" uuid_ops);