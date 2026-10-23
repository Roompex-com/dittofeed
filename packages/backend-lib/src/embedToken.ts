import { createHmac, timingSafeEqual } from "crypto";

import { err, ok, Result } from "neverthrow";

/**
 * Token format: URL-safe base64 encoded JSON payload
 * `{workspaceId, occupantId, exp}`, followed by ".", followed by the hex
 * encoded HMAC-SHA256 of the encoded payload, keyed by the shared embed
 * secret (config key `dittofeedEmbedSecret`, env var DITTOFEED_EMBED_SECRET).
 */

export interface EmbedTokenPayload {
  workspaceId: string;
  occupantId: string;
  /** Expiration as epoch seconds. Tokens older than this are rejected. */
  exp: number;
}

export enum VerifyEmbedTokenError {
  Malformed = "Malformed",
  BadSignature = "BadSignature",
  Expired = "Expired",
}

/** Standard embed token lifetime: 1 hour. */
export const EMBED_TOKEN_TTL_SECONDS = 60 * 60;

const HMAC_HEX_LENGTH = 64;

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeJson(encoded: string): unknown {
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(decoded);
}

function hmacHex(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("hex");
}

function constantTimeEqualsHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bufferA = new Uint8Array(Buffer.from(a, "utf8"));
  const bufferB = new Uint8Array(Buffer.from(b, "utf8"));
  return timingSafeEqual(bufferA, bufferB);
}

function isEmbedTokenPayload(value: unknown): value is EmbedTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { workspaceId, occupantId, exp } = value as Partial<EmbedTokenPayload>;
  return (
    typeof workspaceId === "string" &&
    typeof occupantId === "string" &&
    typeof exp === "number" &&
    Number.isFinite(exp)
  );
}

export function signEmbedToken(
  payload: EmbedTokenPayload,
  secret: string,
): string {
  const encodedPayload = base64UrlEncodeJson(payload);
  const signature = hmacHex(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyEmbedToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): Result<EmbedTokenPayload, VerifyEmbedTokenError> {
  const splitToken = token.split(".");
  if (splitToken.length !== 2) {
    return err(VerifyEmbedTokenError.Malformed);
  }
  const [encodedPayload, signature] = splitToken as [string, string];
  if (!encodedPayload || !signature) {
    return err(VerifyEmbedTokenError.Malformed);
  }
  if (signature.length !== HMAC_HEX_LENGTH || !/^[0-9a-f]+$/.test(signature)) {
    return err(VerifyEmbedTokenError.Malformed);
  }
  const expectedSignature = hmacHex(encodedPayload, secret);
  if (!constantTimeEqualsHex(signature, expectedSignature)) {
    return err(VerifyEmbedTokenError.BadSignature);
  }
  let decodedPayload: unknown;
  try {
    decodedPayload = base64UrlDecodeJson(encodedPayload);
  } catch {
    return err(VerifyEmbedTokenError.Malformed);
  }
  if (!isEmbedTokenPayload(decodedPayload)) {
    return err(VerifyEmbedTokenError.Malformed);
  }
  if (decodedPayload.exp * 1000 <= nowMs) {
    return err(VerifyEmbedTokenError.Expired);
  }
  return ok(decodedPayload);
}
