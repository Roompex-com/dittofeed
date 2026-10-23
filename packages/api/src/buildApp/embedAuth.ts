import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  extractEmbedTokenFromCookieHeader,
  verifyEmbedSessionToken,
  VerifyEmbedSessionError,
} from "backend-lib/src/embedSession";
import { getEmbedRequestContext } from "backend-lib/src/requestContext";
import {
  DFRequestContext,
  EmbeddedSession,
  RequestContextErrorType,
} from "backend-lib/src/types";
import { eq } from "drizzle-orm";
import { FastifyRequest } from "fastify";

/**
 * Embed session authentication: accepts the `embed_session` cookie (holding
 * the HMAC signed embed token) as an alternative authentication source,
 * resolving the request context to an occupant of the token's workspace with
 * member level access, scoped to that workspace only.
 */

export type EmbedCookieAuthResult =
  | {
      outcome: "absent";
    }
  | {
      outcome: "rejected";
      reason: "invalid-token" | "workspace-not-found" | "workspace-inactive";
    }
  | {
      outcome: "authenticated";
      session: EmbeddedSession;
      context: DFRequestContext;
    };

export async function authenticateEmbedCookie(
  request: FastifyRequest,
): Promise<EmbedCookieAuthResult> {
  const token = extractEmbedTokenFromCookieHeader(request.headers.cookie);
  if (!token) {
    return { outcome: "absent" };
  }
  const verified = verifyEmbedSessionToken(token);
  if (verified.isErr()) {
    // Treat a secret that isn't configured as "no embed auth available"
    // rather than rejecting, so stale cookies can't lock out normal auth.
    if (verified.error === VerifyEmbedSessionError.NotConfigured) {
      return { outcome: "absent" };
    }
    return { outcome: "rejected", reason: "invalid-token" };
  }
  const { workspaceId, occupantId } = verified.value;
  const contextResult = await getEmbedRequestContext({
    workspaceId,
    occupantId,
  });
  if (contextResult.isErr()) {
    switch (contextResult.error.type) {
      case RequestContextErrorType.WorkspaceInactive:
        return { outcome: "rejected", reason: "workspace-inactive" };
      default:
        return { outcome: "rejected", reason: "workspace-not-found" };
    }
  }
  return {
    outcome: "authenticated",
    session: { workspaceId, occupantId },
    context: contextResult.value,
  };
}

/**
 * Applies an authenticated embed context to the request: populates the
 * request context store and the embeddedSession seam on request.raw, so
 * downstream code (e.g. getOccupantFromRequest) resolves the occupant.
 */
export function applyEmbedRequestContext(
  request: FastifyRequest,
  session: EmbeddedSession,
  context: DFRequestContext,
) {
  (request.raw as { embeddedSession?: EmbeddedSession }).embeddedSession =
    session;
  request.requestContext.set("workspace", context.workspace);
  request.requestContext.set("member", context.member);
  request.requestContext.set("memberRoles", context.memberRoles);
}

/**
 * Resolves the workspaceId an embed session's workspace identifier maps to,
 * for enforcing that an embed token for workspace A cannot access workspace B
 * resources. Returns null when the identifier does not match.
 */
export async function embedSessionMatchesIdentifier(
  session: EmbeddedSession,
  identifier: { workspaceId: string } | { externalId: string },
): Promise<boolean> {
  if ("workspaceId" in identifier) {
    return identifier.workspaceId === session.workspaceId;
  }
  const workspace = await db().query.workspace.findFirst({
    columns: {
      id: true,
    },
    where: eq(schema.workspace.externalId, identifier.externalId),
  });
  return workspace?.id === session.workspaceId;
}
