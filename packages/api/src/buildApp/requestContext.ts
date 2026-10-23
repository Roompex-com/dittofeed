import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { getRequestContext, SESSION_KEY } from "backend-lib/src/requestContext";
import {
  DBWorkspaceOccupantType,
  EmbeddedSession,
  OpenIdProfile,
  RequestContextErrorType,
} from "backend-lib/src/types";
import { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { getWorkspaceId } from "../workspace";
import { applyEmbedRequestContext, authenticateEmbedCookie } from "./embedAuth";

export function requestToSessionValue(request: FastifyRequest):
  | {
      [SESSION_KEY]: "true" | "false";
    }
  | undefined {
  if (backendConfig().authMode !== "single-tenant") {
    return undefined;
  }

  const hasSession = request.session.get(SESSION_KEY) === true;
  return { [SESSION_KEY]: hasSession ? "true" : "false" };
}

export function getRequestContextFastify(request: FastifyRequest) {
  const headers = {
    ...request.headers,
    ...requestToSessionValue(request),
  };
  const { user: profile } = request as { user?: OpenIdProfile };
  return getRequestContext(headers, profile);
}

// eslint-disable-next-line @typescript-eslint/require-await
const requestContext = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const rc = await getRequestContextFastify(request);

    // The embed_session cookie is an alternative authentication source. It
    // is only consulted when standard auth did not authenticate the request,
    // so existing cookie auth keeps working unchanged. The resolved context
    // is an occupant of the token's workspace, scoped to that workspace only.
    if (rc.isErr() && rc.error.type === RequestContextErrorType.NotAuthenticated) {
      const embedAuth = await authenticateEmbedCookie(request);
      if (embedAuth.outcome === "rejected") {
        logger().info(
          {
            path: request.url,
            method: request.method,
            reason: embedAuth.reason,
          },
          "embed session rejected",
        );
        return reply.status(401).send();
      }
      if (embedAuth.outcome === "authenticated") {
        // Workspace scoping: the request's workspace must match the token's
        // workspace, so a token for workspace A cannot access workspace B.
        const embedWorkspaceIdResult = await getWorkspaceId(request);
        if (embedWorkspaceIdResult.isErr()) {
          return reply.status(400).send();
        }
        const embedWorkspaceId = embedWorkspaceIdResult.value;
        if (embedWorkspaceId !== embedAuth.context.workspace.id) {
          logger().info(
            {
              embedWorkspaceId,
              tokenWorkspaceId: embedAuth.context.workspace.id,
            },
            "embed session workspace does not match request",
          );
          return reply.status(403).send();
        }
        applyEmbedRequestContext(request, embedAuth.session, embedAuth.context);
        return null;
      }
    }

    if (rc.isErr()) {
      switch (rc.error.type) {
        case RequestContextErrorType.ApplicationError:
          throw new Error(rc.error.message);
        case RequestContextErrorType.NotAuthenticated:
          logger().debug({ rc: rc.error }, "Not authenticated");
          return reply.status(401).send();
        case RequestContextErrorType.Unauthorized:
          return reply.redirect(rc.error.action.url);
        case RequestContextErrorType.WorkspaceInactive:
          logger().info(
            {
              contextErrorMsg: rc.error.message,
              workspace: rc.error.workspace,
            },
            "workspace inactive",
          );
          return reply.status(403).send();
        default:
          logger().error(
            {
              err: rc.error,
            },
            "unknown request context error",
          );
          return reply.status(403).send();
      }
    }

    const requestWorkspaceIdResult = await getWorkspaceId(request);
    if (requestWorkspaceIdResult.isErr()) {
      return reply.status(400).send();
    }

    const { workspace, member, memberRoles } = rc.value;
    const workspaceId = requestWorkspaceIdResult.value;
    if (workspaceId !== workspace.id) {
      logger().error(
        {
          workspaceId,
          workspaceIdFromRequest: workspace.id,
        },
        "workspace id does not match",
      );
      return reply.status(403).send();
    }

    request.requestContext.set("workspace", workspace);
    request.requestContext.set("member", member);
    request.requestContext.set("memberRoles", memberRoles);
    return null;
  });
});

export default requestContext;

export function getOccupantFromRequest(request: FastifyRequest): {
  workspaceOccupantId: string;
  workspaceOccupantType: DBWorkspaceOccupantType;
} | null {
  const { embeddedSession } = request.raw as {
    embeddedSession?: EmbeddedSession;
  };
  if (backendConfig().authMode === "anonymous") {
    return {
      workspaceOccupantId: "anonymous",
      workspaceOccupantType: "WorkspaceMember",
    };
  }

  if (embeddedSession?.occupantId) {
    return {
      workspaceOccupantId: embeddedSession.occupantId,
      workspaceOccupantType: "ChildWorkspaceOccupant",
    };
  }

  const member = request.requestContext.get("member");
  if (member) {
    return {
      workspaceOccupantId: member.id,
      workspaceOccupantType: "WorkspaceMember",
    };
  }
  return null;
}
