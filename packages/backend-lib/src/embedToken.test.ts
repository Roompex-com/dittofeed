import {
  EMBED_TOKEN_TTL_SECONDS,
  signEmbedToken,
  VerifyEmbedTokenError,
  verifyEmbedToken,
} from "./embedToken";

describe("embedToken", () => {
  const secret = "test-embed-secret";
  const nowMs = 1_700_000_000_000;
  const payload = {
    workspaceId: "8e6ecb3f-1f2e-4a3b-9c5d-6f7e8a9b0c1d",
    occupantId: "manager-user-1",
    exp: Math.floor(nowMs / 1000) + EMBED_TOKEN_TTL_SECONDS,
  };

  describe("signEmbedToken / verifyEmbedToken round trip", () => {
    it("verifies a token it signed", () => {
      const token = signEmbedToken(payload, secret);
      const result = verifyEmbedToken(token, secret, nowMs);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(payload);
      }
    });

    it("produces url-safe base64 payloads and hex signatures", () => {
      const token = signEmbedToken(payload, secret);
      const separatorIndex = token.indexOf(".");
      const encodedPayload = token.slice(0, separatorIndex);
      const signature = token.slice(separatorIndex + 1);
      expect(encodedPayload).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("tampered payloads", () => {
    it("rejects a payload modified after signing", () => {
      const token = signEmbedToken(payload, secret);
      const separatorIndex = token.indexOf(".");
      const encodedPayload = token.slice(0, separatorIndex);
      const signature = token.slice(separatorIndex + 1);
      const decoded = JSON.parse(
        Buffer.from(encodedPayload, "base64").toString("utf8"),
      );
      decoded.workspaceId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      const tamperedPayload = Buffer.from(
        JSON.stringify(decoded),
        "utf8",
      ).toString("base64");
      const tamperedToken = `${tamperedPayload}.${signature}`;
      const result = verifyEmbedToken(tamperedToken, secret, nowMs);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(VerifyEmbedTokenError.BadSignature);
      }
    });

    it("rejects a token signed with a different secret", () => {
      const token = signEmbedToken(payload, "other-secret");
      const result = verifyEmbedToken(token, secret, nowMs);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(VerifyEmbedTokenError.BadSignature);
      }
    });

    it("rejects a modified signature", () => {
      const token = signEmbedToken(payload, secret);
      const separatorIndex = token.indexOf(".");
      const encodedPayload = token.slice(0, separatorIndex);
      const signature = token.slice(separatorIndex + 1);
      const flipped = signature.startsWith("0")
        ? signature.replace(/^0/, "1")
        : signature.replace(/^./, "0");
      const result = verifyEmbedToken(
        `${encodedPayload}.${flipped}`,
        secret,
        nowMs,
      );
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(VerifyEmbedTokenError.BadSignature);
      }
    });
  });

  describe("expiry", () => {
    it("rejects an expired token", () => {
      const expiredPayload = {
        ...payload,
        exp: Math.floor(nowMs / 1000) - 1,
      };
      const token = signEmbedToken(expiredPayload, secret);
      const result = verifyEmbedToken(token, secret, nowMs);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(VerifyEmbedTokenError.Expired);
      }
    });

    it("accepts a token whose exp is in the future", () => {
      const token = signEmbedToken(
        { ...payload, exp: Math.floor(nowMs / 1000) + 60 },
        secret,
      );
      const result = verifyEmbedToken(token, secret, nowMs);
      expect(result.isOk()).toBe(true);
    });

    it("rejects a token whose exp is exactly now", () => {
      const token = signEmbedToken(
        { ...payload, exp: Math.floor(nowMs / 1000) },
        secret,
      );
      const result = verifyEmbedToken(token, secret, nowMs);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(VerifyEmbedTokenError.Expired);
      }
    });
  });

  describe("malformed tokens", () => {
    it.each([
      ["empty string", ""],
      ["no separator", "abcdef"],
      ["too many separators", "a.b.c"],
      ["empty signature", "eyJmb28iOjF9."],
      ["non hex signature", `eyJmb28iOjF9.${"z".repeat(64)}`],
      ["garbage base64", "!!!.abcdef"],
    ])("rejects %s", (_name, token) => {
      const result = verifyEmbedToken(token, secret, nowMs);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(VerifyEmbedTokenError.Malformed);
      }
    });
  });

  describe("workspace scoping", () => {
    it("returns the workspaceId of the signed payload, not the requester", () => {
      const workspaceA = "11111111-1111-1111-1111-111111111111";
      const workspaceB = "22222222-2222-2222-2222-222222222222";
      const tokenA = signEmbedToken(
        { ...payload, workspaceId: workspaceA },
        secret,
      );
      const result = verifyEmbedToken(tokenA, secret, nowMs);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.workspaceId).toBe(workspaceA);
        expect(result.value.workspaceId).not.toBe(workspaceB);
      }
    });
  });
});
