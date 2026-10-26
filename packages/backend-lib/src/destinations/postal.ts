import { Static, Type } from "@sinclair/typebox";
import axios from "axios";
import { eq } from "drizzle-orm";
import { SourceType } from "isomorphic-lib/src/constants";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import * as R from "remeda";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps/batch";
import { MESSAGE_METADATA_FIELDS } from "../constants";
import { db } from "../db";
import * as schema from "../db/schema";
import logger from "../logger";
import {
  BatchAppData,
  BatchItem,
  BatchTrackData,
  EmailProviderType,
  EventType,
  InternalEventType,
} from "../types";

// --- Send API ---

export interface PostalSendSuccess {
  messageId?: string;
  postalMessageIds: number[];
}

export interface PostalSendError {
  message: string;
  status?: number;
}

interface PostalSendResponseMessage {
  id?: number;
  token?: string;
  address?: string;
}

interface PostalSendResponse {
  status?: string;
  data?: {
    message_id?: string;
    messages?:
      | PostalSendResponseMessage[]
      | Record<string, PostalSendResponseMessage>;
  };
}

export async function sendMailPostal({
  apiKey,
  baseUrl,
  to,
  cc,
  bcc,
  from,
  name,
  replyTo,
  subject,
  body,
  headers,
  attachments,
}: {
  apiKey: string;
  baseUrl: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  from: string;
  name?: string;
  replyTo?: string;
  subject: string;
  body: string;
  headers?: Record<string, string>;
  attachments?: { name: string; mimeType: string; data: string }[];
}): Promise<Result<PostalSendSuccess, PostalSendError>> {
  const fromField = name ? `${name} <${from}>` : from;
  try {
    const response = await axios.post<PostalSendResponse>(
      `${baseUrl.replace(/\/$/, "")}/api/v1/send/message`,
      {
        to,
        ...(cc?.length ? { cc: cc.join(",") } : {}),
        ...(bcc?.length ? { bcc: bcc.join(",") } : {}),
        from: fromField,
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        html_body: body,
        ...(headers && Object.keys(headers).length ? { headers } : {}),
        ...(attachments?.length
          ? {
              attachments: attachments.map((a) => ({
                name: a.name,
                content_type: a.mimeType,
                data: Buffer.from(a.data, "utf-8").toString("base64"),
              })),
            }
          : {}),
      },
      {
        headers: {
          "X-Server-API-Key": apiKey,
          // Explicit: without this, Rails does not parse the JSON body and
          // the send fails with NoRecipients (verified against Postal 3.3.7).
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      },
    );
    const responseBody = response.data;
    if (responseBody.status !== "success" || !responseBody.data) {
      return err({
        message: JSON.stringify(responseBody),
        status: response.status,
      });
    }
    const { data } = responseBody;
    // data.messages is per-recipient: either [{id, token, address}] or
    // {address: {id, token}}
    const ids: number[] = [];
    const { messages } = data;
    if (Array.isArray(messages)) {
      for (const m of messages) {
        if (typeof m.id === "number") {
          ids.push(m.id);
        }
      }
    } else if (messages) {
      for (const key of Object.keys(messages)) {
        const m = messages[key];
        if (typeof m?.id === "number") {
          ids.push(m.id);
        }
      }
    }
    return ok({
      messageId:
        typeof data.message_id === "string" ? data.message_id : undefined,
      postalMessageIds: ids,
    });
  } catch (e) {
    const axiosErr = e as {
      response?: { status?: number; data?: unknown };
      message: string;
    };
    return err({
      message: axiosErr.response
        ? JSON.stringify(axiosErr.response.data ?? axiosErr.message)
        : axiosErr.message,
      ...(axiosErr.response?.status
        ? { status: axiosErr.response.status }
        : {}),
    });
  }
}

// --- Webhooks ---

export const PostalWebhookEventName = Type.Union([
  Type.Literal("MessageSent"),
  Type.Literal("MessageDelayed"),
  Type.Literal("MessageDeliveryFailed"),
  Type.Literal("MessageHeld"),
  Type.Literal("MessageBounced"),
  Type.Literal("MessageLinkClicked"),
  Type.Literal("MessageLoaded"),
  Type.Literal("DomainDNSError"),
]);

const PostalWebhookMessage = Type.Object({
  id: Type.Integer(),
  to: Type.Optional(Type.String()),
});

export const PostalWebhookBody = Type.Object({
  event: PostalWebhookEventName,
  timestamp: Type.Number(),
  uuid: Type.Optional(Type.String()),
  payload: Type.Object({
    status: Type.Optional(Type.String()),
    details: Type.Optional(Type.String()),
    output: Type.Optional(Type.String()),
    ip_address: Type.Optional(Type.String()),
    user_agent: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    message: Type.Optional(PostalWebhookMessage),
    original_message: Type.Optional(PostalWebhookMessage),
  }),
});

export type PostalWebhookBody = Static<typeof PostalWebhookBody>;

export type PostalMessageMapping =
  typeof schema.postalMessageMappings.$inferSelect;

function postalMetadataProperties(
  mapping: PostalMessageMapping,
): Record<string, string> {
  const metadata = R.pick(mapping, MESSAGE_METADATA_FIELDS);
  const properties: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== null) {
      properties[key] = value;
    }
  }
  return properties;
}

export function postalWebhookEventToBatchItem({
  body,
  mapping,
}: {
  body: PostalWebhookBody;
  mapping: PostalMessageMapping;
}): Result<BatchItem | null, Error> {
  const { event, payload } = body;

  let eventName: InternalEventType;
  let bounceType: string | undefined;
  switch (event) {
    case "MessageSent":
      eventName = InternalEventType.EmailDelivered;
      break;
    case "MessageDeliveryFailed":
      eventName = InternalEventType.EmailBounced;
      bounceType = "hard";
      break;
    case "MessageBounced":
      eventName = InternalEventType.EmailBounced;
      bounceType = "bounce";
      break;
    case "MessageHeld":
      eventName = InternalEventType.EmailDropped;
      break;
    case "MessageLoaded":
      eventName = InternalEventType.EmailOpened;
      break;
    case "MessageLinkClicked":
      eventName = InternalEventType.EmailClicked;
      break;
    case "MessageDelayed":
    case "DomainDNSError":
      return ok(null);
    default:
      return err(new Error("Unhandled postal webhook event."));
  }

  const postalMessageId = payload.original_message?.id ?? payload.message?.id;
  if (!postalMessageId) {
    return err(new Error("Missing postal message id in payload."));
  }

  const email =
    payload.original_message?.to ?? payload.message?.to ?? mapping.userId;

  // The stable uuidv5 message id dedupes Postal webhook retries.
  const messageId = uuidv5(
    `${event}:${body.uuid ?? postalMessageId}`,
    mapping.workspaceId,
  );

  const properties: Record<string, string> = {
    email,
    ...postalMetadataProperties(mapping),
  };
  if (bounceType) {
    properties.bounceType = bounceType;
  }
  if (payload.output) {
    properties.output = payload.output;
  }
  if (payload.details) {
    properties.details = payload.details;
  }
  if (payload.ip_address) {
    properties.ipAddress = payload.ip_address;
  }
  if (payload.user_agent) {
    properties.userAgent = payload.user_agent;
  }
  if (payload.url) {
    properties.url = payload.url;
  }

  const item: BatchTrackData = {
    type: EventType.Track,
    event: eventName,
    userId: mapping.userId,
    messageId,
    timestamp: new Date(body.timestamp * 1000).toISOString(),
    properties,
  };

  return ok(item);
}

export async function submitPostalWebhookEvent({
  body,
}: {
  body: PostalWebhookBody;
}): Promise<Result<null, Error>> {
  const bodyResult = schemaValidateWithErr(body, PostalWebhookBody);
  if (bodyResult.isErr()) {
    return err(bodyResult.error);
  }
  const validated = bodyResult.value;
  const postalMessageId =
    validated.payload.original_message?.id ?? validated.payload.message?.id;
  if (!postalMessageId) {
    return err(new Error("Missing postal message id in payload."));
  }

  const mapping = await db().query.postalMessageMappings.findFirst({
    where: eq(schema.postalMessageMappings.postalMessageId, postalMessageId),
  });
  if (!mapping) {
    return err(
      new Error(
        `Postal message mapping not found for postal message id ${postalMessageId}.`,
      ),
    );
  }

  const itemResult = postalWebhookEventToBatchItem({
    body: validated,
    mapping,
  });
  if (itemResult.isErr()) {
    return err(itemResult.error);
  }
  const item = itemResult.value;
  if (!item) {
    return ok(null);
  }

  const data: BatchAppData = {
    context: {
      source: SourceType.Webhook,
      provider: EmailProviderType.Postal,
    },
    batch: [item],
  };
  await submitBatch({
    workspaceId: mapping.workspaceId,
    data,
  });
  logger().debug(
    { event: validated.event, postalMessageId },
    "Submitted postal webhook event.",
  );
  return ok(null);
}
