import { randomBytes } from "crypto";
import { Webhook } from "svix";

import { verifyQuoWebhookSignature } from "./quoWebhook";

describe("verifyQuoWebhookSignature", () => {
  const webhookSecret = `whsec_${randomBytes(24).toString("base64")}`;
  const payload = JSON.stringify({
    id: "evt_test",
    apiVersion: "2026-03-30",
    type: "message.delivered",
    data: {
      resource: {
        id: "AC123",
      },
    },
  });

  function signPayload(secret: string, body: string) {
    const wh = new Webhook(secret);
    const webhookId = `msg_${randomBytes(8).toString("hex")}`;
    const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
    const webhookSignature = wh.sign(webhookId, new Date(), body);
    return {
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp,
      "webhook-signature": webhookSignature,
    };
  }

  it("accepts a valid signature", () => {
    const headers = signPayload(webhookSecret, payload);
    expect(
      verifyQuoWebhookSignature({
        rawBody: payload,
        headers,
        webhookSecret,
      }),
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const headers = signPayload(webhookSecret, payload);
    // Tamper with the body after signing.
    expect(
      verifyQuoWebhookSignature({
        rawBody: `${payload} `,
        headers,
        webhookSecret,
      }),
    ).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const headers = signPayload(
      `whsec_${randomBytes(24).toString("base64")}`,
      payload,
    );
    expect(
      verifyQuoWebhookSignature({
        rawBody: payload,
        headers,
        webhookSecret,
      }),
    ).toBe(false);
  });
});
