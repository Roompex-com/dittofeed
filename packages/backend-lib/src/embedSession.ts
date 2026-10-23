import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { err, ok, Result } from "neverthrow";

import config from "./config";
import {
  EmbedTokenPayload,
  verifyEmbedToken,
  VerifyEmbedTokenError,
} from "./embedToken";

/**
 * Server side helpers for the HMAC embed session: resolving the embed secret
 * from config, extracting the `embed_session` cookie, and serializing it.
 */

export const EMBED_SESSION_COOKIE = "embed_session";

export enum VerifyEmbedSessionError {
  NotConfigured = "NotConfigured",
  Malformed = "Malformed",
  BadSignature = "BadSignature",
  Expired = "Expired",
}

export function verifyEmbedSessionToken(
  token: string,
): Result<EmbedTokenPayload, VerifyEmbedSessionError> {
  const secret = config().dittofeedEmbedSecret;
  if (!secret) {
    return err(VerifyEmbedSessionError.NotConfigured);
  }
  const result = verifyEmbedToken(token, secret);
  if (result.isErr()) {
    switch (result.error) {
      case VerifyEmbedTokenError.Malformed:
        return err(VerifyEmbedSessionError.Malformed);
      case VerifyEmbedTokenError.BadSignature:
        return err(VerifyEmbedSessionError.BadSignature);
      case VerifyEmbedTokenError.Expired:
        return err(VerifyEmbedSessionError.Expired);
      default:
        assertUnreachable(result.error);
        return err(VerifyEmbedSessionError.Malformed);
    }
  }
  return ok(result.value);
}

export function extractEmbedTokenFromCookieHeader(
  cookieHeader: string | string[] | undefined,
): string | null {
  if (typeof cookieHeader !== "string") {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const name = trimmed.slice(0, separatorIndex);
    if (name === EMBED_SESSION_COOKIE) {
      return trimmed.slice(separatorIndex + 1);
    }
  }
  return null;
}

export function isLocalHostHostHeader(host: string | undefined): boolean {
  if (!host) {
    return false;
  }
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}

export function serializeEmbedSessionCookie({
  token,
  expiresAtMs,
  secure,
}: {
  token: string;
  expiresAtMs: number;
  secure: boolean;
}): string {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
  // HttpOnly + SameSite=Lax + Path=/, with Secure omitted for localhost.
  const attributes = [
    `${EMBED_SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}
