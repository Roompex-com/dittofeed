import logger from "backend-lib/src/logger";
import { Webhook } from "svix";

/**
 * Verifies a Quo webhook's svix-style HMAC signature over the raw request
 * body. Quo delivers webhooks with `webhook-id`, `webhook-timestamp`, and
 * `webhook-signature` headers, signed with the workspace's `whsec_...`
 * webhook secret.
 */
export function verifyQuoWebhookSignature({
  rawBody,
  headers,
  webhookSecret,
}: {
  rawBody: string;
  headers: Record<string, string>;
  webhookSecret: string;
}): boolean {
  try {
    new Webhook(webhookSecret).verify(rawBody, headers);
    return true;
  } catch (e) {
    logger().info(
      {
        err: e instanceof Error ? e.message : e,
      },
      "Invalid signature for Quo webhook.",
    );
    return false;
  }
}
