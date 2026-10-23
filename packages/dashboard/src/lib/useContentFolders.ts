import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  ContentFolder,
  ContentFolderResourceType,
  GetContentFoldersResponse,
  UpsertContentFolderRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { JOURNEYS_QUERY_KEY } from "./constants";
import { SEGMENTS_QUERY_KEY } from "./useSegmentsQuery";

export const CONTENT_FOLDERS_QUERY_KEY = "contentFolders";

export const ALL_FOLDERS_FILTER = "all";
export const ROOT_FOLDER_FILTER = "root";

export function useContentFoldersQuery({
  resourceType,
}: {
  resourceType: ContentFolderResourceType;
}): UseQueryResult<ContentFolder[]> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for content folders query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [
    CONTENT_FOLDERS_QUERY_KEY,
    { workspaceId, resourceType },
  ];

  return useQuery<GetContentFoldersResponse, Error, ContentFolder[]>({
    queryKey,
    queryFn: async (): Promise<GetContentFoldersResponse> => {
      try {
        const response = await axios.get(`${baseApiUrl}/content/folders`, {
          params: {
            workspaceId,
            resourceType,
          },
          headers: authHeaders,
        });

        return unwrap(
          schemaValidateWithErr(response.data, GetContentFoldersResponse),
        );
      } catch (error) {
        console.error("Failed to fetch content folders", error);
        throw error;
      }
    },
    select: (data) => data.folders,
  });
}

export function useUpsertContentFolderMutation(
  options?: Omit<
    UseMutationOptions<
      ContentFolder,
      Error,
      Omit<UpsertContentFolderRequest, "workspaceId">
    >,
    "mutationFn"
  >,
): UseMutationResult<
  ContentFolder,
  Error,
  Omit<UpsertContentFolderRequest, "workspaceId">
> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();
  const queryClient = useQueryClient();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for content folder mutation");
  }

  const workspaceId = workspace.value.id;

  const mutationFn = async (
    data: Omit<UpsertContentFolderRequest, "workspaceId">,
  ): Promise<ContentFolder> => {
    const response = await axios.put(
      `${baseApiUrl}/content/folders`,
      {
        ...data,
        workspaceId,
      } satisfies UpsertContentFolderRequest,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );

    return unwrap(schemaValidateWithErr(response.data, ContentFolder));
  };

  return useMutation({
    mutationFn,
    ...options,
    onSettled: (data, error, variables, context) => {
      options?.onSettled?.(data, error, variables, context);
      queryClient.invalidateQueries({
        queryKey: [CONTENT_FOLDERS_QUERY_KEY, { workspaceId }],
      });
    },
  });
}

export type MoveToFolderVariables = {
  id: string;
  name?: string;
  folderId: string | null;
};

/**
 * Moves a template, journey, segment, or broadcast into a folder (or out of
 * one, when folderId is null) via each resource's existing upsert endpoint.
 */
export function useMoveToFolderMutation(
  resourceType: ContentFolderResourceType,
  options?: Omit<
    UseMutationOptions<unknown, Error, MoveToFolderVariables>,
    "mutationFn"
  >,
): UseMutationResult<unknown, Error, MoveToFolderVariables> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();
  const queryClient = useQueryClient();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for move to folder mutation");
  }

  const workspaceId = workspace.value.id;

  const mutationFn = async (data: MoveToFolderVariables): Promise<unknown> => {
    let url: string;
    let body: object;
    switch (resourceType) {
      case "Template": {
        url = `${baseApiUrl}/content/templates`;
        body = {
          workspaceId,
          id: data.id,
          name: data.name,
          folderId: data.folderId,
        };
        break;
      }
      case "Journey": {
        url = `${baseApiUrl}/journeys`;
        body = {
          workspaceId,
          id: data.id,
          folderId: data.folderId,
        };
        break;
      }
      case "Segment": {
        url = `${baseApiUrl}/segments`;
        body = {
          workspaceId,
          id: data.id,
          folderId: data.folderId,
        };
        break;
      }
      case "Broadcast": {
        url = `${baseApiUrl}/broadcasts/v2`;
        body = {
          workspaceId,
          id: data.id,
          folderId: data.folderId,
        };
        break;
      }
      default: {
        throw new Error(`Unsupported resource type: ${resourceType}`);
      }
    }

    const response = await axios.put(url, body, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });
    return response.data;
  };

  return useMutation<unknown, Error, MoveToFolderVariables>({
    mutationFn,
    ...options,
    onSettled: (...args) => {
      options?.onSettled?.(...args);
      const invalidateKeyByResource: Record<
        ContentFolderResourceType,
        unknown[]
      > = {
        Template: ["messageTemplates", { workspaceId }],
        Journey: [JOURNEYS_QUERY_KEY, { workspaceId }],
        Segment: [SEGMENTS_QUERY_KEY, { workspaceId }],
        Broadcast: ["broadcasts", { workspaceId }],
      };
      queryClient.invalidateQueries({
        queryKey: invalidateKeyByResource[resourceType],
      });
    },
  });
}
