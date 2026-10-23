CREATE TYPE "public"."DBContentFolderResourceType" AS ENUM('Template', 'Journey', 'Segment', 'Broadcast');--> statement-breakpoint
CREATE TABLE "content_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"resourceType" "DBContentFolderResourceType" NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "folderId" uuid;--> statement-breakpoint
ALTER TABLE "Journey" ADD COLUMN "folderId" uuid;--> statement-breakpoint
ALTER TABLE "MessageTemplate" ADD COLUMN "folderId" uuid;--> statement-breakpoint
ALTER TABLE "Segment" ADD COLUMN "folderId" uuid;--> statement-breakpoint
ALTER TABLE "content_folders" ADD CONSTRAINT "content_folders_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "content_folders_workspaceId_resourceType_name_key" ON "content_folders" USING btree ("workspaceId" uuid_ops,"resourceType" enum_ops,"name" text_ops);--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."content_folders"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."content_folders"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."content_folders"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."content_folders"("id") ON DELETE restrict ON UPDATE cascade;