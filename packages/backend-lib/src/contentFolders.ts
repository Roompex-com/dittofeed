import { and, eq, SQL } from "drizzle-orm";
import {
  ContentFolder,
  ContentFolderResourceTypeEnum,
  ContentFolderResourceType,
  DeleteContentFolderRequest,
  GetContentFoldersRequest,
  UpsertContentFolderError,
  UpsertContentFolderErrorTypeEnum,
  UpsertContentFolderRequest,
} from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";
import { PostgresError } from "pg-error-enum";
import { validate as validateUuid } from "uuid";

import { db, TxQueryError, txQueryResult } from "./db";
import {
  broadcast as dbBroadcast,
  contentFolder as dbContentFolder,
  journey as dbJourney,
  messageTemplate as dbMessageTemplate,
  segment as dbSegment,
} from "./db/schema";
import logger from "./logger";
import { ContentFolderModel } from "./types";

export type DeleteContentFolderError =
  | {
      type: "NotFound";
    }
  | {
      type: "FolderNotEmpty";
      message: string;
    };

export function contentFolderToResource(
  folder: ContentFolderModel,
): ContentFolder {
  return {
    id: folder.id,
    workspaceId: folder.workspaceId,
    name: folder.name,
    resourceType: folder.resourceType as ContentFolderResourceType,
    createdAt: folder.createdAt.getTime(),
    updatedAt: folder.updatedAt.getTime(),
  };
}

export async function getContentFolders({
  workspaceId,
  resourceType,
}: GetContentFoldersRequest): Promise<ContentFolder[]> {
  const conditions: SQL[] = [eq(dbContentFolder.workspaceId, workspaceId)];
  if (resourceType) {
    conditions.push(eq(dbContentFolder.resourceType, resourceType));
  }
  const folders = await db().query.contentFolder.findMany({
    where: and(...conditions),
    orderBy: (table, { asc }) => [asc(table.name)],
  });
  return folders.map(contentFolderToResource);
}

export async function upsertContentFolder(
  data: UpsertContentFolderRequest,
): Promise<Result<ContentFolder, UpsertContentFolderError>> {
  const { workspaceId, id, name, resourceType } = data;
  if (id && !validateUuid(id)) {
    return err({
      type: UpsertContentFolderErrorTypeEnum.IdError,
      message: "Invalid content folder id, must be a valid v4 UUID",
    });
  }

  const txResult: Result<ContentFolderModel, TxQueryError> =
    await db().transaction(async (tx) => {
      const findFirstConditions: SQL[] = [
        eq(dbContentFolder.workspaceId, workspaceId),
      ];
      if (id) {
        findFirstConditions.push(eq(dbContentFolder.id, id));
      } else {
        findFirstConditions.push(
          eq(dbContentFolder.resourceType, resourceType),
          eq(dbContentFolder.name, name),
        );
      }
      const existingFolder = await tx.query.contentFolder.findFirst({
        where: and(...findFirstConditions),
      });
      if (!existingFolder) {
        const createResult = await txQueryResult(
          tx
            .insert(dbContentFolder)
            .values({
              id,
              workspaceId,
              name,
              resourceType,
            })
            .returning(),
        );
        if (createResult.isErr()) {
          return err(createResult.error);
        }
        const createdFolder = createResult.value[0];
        if (!createdFolder) {
          throw new Error("content folder not found");
        }
        return ok(createdFolder);
      }
      const updateResult = await txQueryResult(
        tx
          .update(dbContentFolder)
          .set({
            name,
          })
          .where(eq(dbContentFolder.id, existingFolder.id))
          .returning(),
      );
      if (updateResult.isErr()) {
        return err(updateResult.error);
      }
      const updatedFolder = updateResult.value[0];
      if (!updatedFolder) {
        throw new Error("content folder not found");
      }
      return ok(updatedFolder);
    });

  if (txResult.isErr()) {
    if (txResult.error.code === PostgresError.UNIQUE_VIOLATION) {
      return err({
        type: UpsertContentFolderErrorTypeEnum.UniqueConstraintViolation,
        message:
          "Folder names must be unique per resource type within a workspace.",
      });
    }
    logger().error(
      {
        err: txResult.error,
        data,
      },
      "Failed to upsert content folder",
    );
    return err({
      type: UpsertContentFolderErrorTypeEnum.IdError,
      message: "Failed to upsert content folder",
    });
  }

  return ok(contentFolderToResource(txResult.value));
}

async function countFolderResources(
  folder: ContentFolderModel,
): Promise<number> {
  switch (folder.resourceType) {
    case ContentFolderResourceTypeEnum.Template: {
      const templates = await db()
        .select({ id: dbMessageTemplate.id })
        .from(dbMessageTemplate)
        .where(
          and(
            eq(dbMessageTemplate.workspaceId, folder.workspaceId),
            eq(dbMessageTemplate.folderId, folder.id),
          ),
        );
      return templates.length;
    }
    case ContentFolderResourceTypeEnum.Journey: {
      const journeys = await db()
        .select({ id: dbJourney.id })
        .from(dbJourney)
        .where(
          and(
            eq(dbJourney.workspaceId, folder.workspaceId),
            eq(dbJourney.folderId, folder.id),
          ),
        );
      return journeys.length;
    }
    case ContentFolderResourceTypeEnum.Segment: {
      const segments = await db()
        .select({ id: dbSegment.id })
        .from(dbSegment)
        .where(
          and(
            eq(dbSegment.workspaceId, folder.workspaceId),
            eq(dbSegment.folderId, folder.id),
          ),
        );
      return segments.length;
    }
    case ContentFolderResourceTypeEnum.Broadcast: {
      const broadcasts = await db()
        .select({ id: dbBroadcast.id })
        .from(dbBroadcast)
        .where(
          and(
            eq(dbBroadcast.workspaceId, folder.workspaceId),
            eq(dbBroadcast.folderId, folder.id),
          ),
        );
      return broadcasts.length;
    }
    default: {
      const exhaustivenessCheck: never = folder.resourceType;
      logger().error(
        { resourceType: exhaustivenessCheck },
        "Unknown content folder resource type",
      );
      return 0;
    }
  }
}

export async function deleteContentFolder({
  workspaceId,
  id,
}: DeleteContentFolderRequest): Promise<Result<null, DeleteContentFolderError>> {
  const folder = await db().query.contentFolder.findFirst({
    where: and(
      eq(dbContentFolder.id, id),
      eq(dbContentFolder.workspaceId, workspaceId),
    ),
  });
  if (!folder) {
    return err({ type: "NotFound" });
  }

  // Deletes of non-empty folders are blocked: resources must be moved out of
  // the folder (folderId set to null) before the folder can be deleted.
  const resourceCount = await countFolderResources(folder);
  if (resourceCount > 0) {
    return err({
      type: "FolderNotEmpty",
      message: `Folder "${folder.name}" still contains ${resourceCount} ${
        resourceCount === 1 ? "resource" : "resources"
      }. Move ${resourceCount === 1 ? "it" : "them"} out of the folder before deleting.`,
    });
  }

  await db()
    .delete(dbContentFolder)
    .where(
      and(
        eq(dbContentFolder.id, folder.id),
        eq(dbContentFolder.workspaceId, workspaceId),
      ),
    );
  return ok(null);
}
