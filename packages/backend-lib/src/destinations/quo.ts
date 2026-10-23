import { eq } from "drizzle-orm";
import { SourceType } from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps/batch";
import { db } from "../db";
import { quoMessageCorrelation } from "../db/schema";
import logger from "../logger";
import {
  BatchTrackData,
  EventType,
  InternalEventType,
  MessageQuoServiceFailure,
  MessageTags,
  QuoWebhookEvent,
  QuoWebhookEventType,
  SmsProviderType,
  SmsQuoSuccess,
} from "../types";

export const QUO_API_BASE_URL = "https://api.quo.com";

export type QuoHandlingApplicationError = Error;

interface QuoSendMessageResponse {
  data?: {
    id?: string;
  };
}

export async function sendSms({
  apiKey,
  from,
  to,
  body,
  workspaceId,
  userId,
  templateId,
}: {
  apiKey: string;
  from: string;
  to: string;
  body: string;
  workspaceId: string;
  userId: string;
  templateId?: string;
}): Promise<Result<SmsQuoSuccess, MessageQuoServiceFailure>> {
  let response: Response;
  try {
    response = await fetch(`${QUO_API_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Quo expects the raw API key in the Authorization header,
        // without a Bearer prefix.
        Authorization: apiKey,
      },
      body: JSON.stringify({
        content: body,
        from,
        to: [to],
      }),
    });
  } catch (e) {
    const error = e as Error;
    logger().error({ err: error }, "Failed to send SMS via Quo");
    return err({
      type: SmsProviderType.Quo,
      message: error.message,
    });
  }

  if (response.status !== 202) {
    const responseBody = await response.text().catch(() => "");
    const message = `Quo responded with status ${response.status}: ${responseBody}`;
    logger().error({ status: response.status }, "Failed to send SMS via Quo");
    return err({
      type: SmsProviderType.Quo,
      message,
    });
  }

  let json: QuoSendMessageResponse;
  try {
    json = (await response.json()) as QuoSendMessageResponse;
  } catch (e) {
    const error = e as Error;
    return err({
      type: SmsProviderType.Quo,
      message: `failed to parse Quo response: ${error.message}`,
    });
  }

  const messageId = json.data?.id;
  if (!messageId) {
    return err({
      type: SmsProviderType.Quo,
      message: "missing message id in Quo response",
    });
  }

  // Quo webhooks are workspace-scoped with no per-message status callback,
  // so persist the correlation between Quo's message id and the DittoFeed
  // user for the webhook handler to resolve.
  await db()
    .insert(quoMessageCorrelation)
    .values({
      messageId,
      workspaceId,
      userId,
      templateId,
    })
    .onConflictDoNothing();

  return ok({
    type: SmsProviderType.Quo,
    messageId,
  });
}

export async function submitQuoEvents({
  workspaceId,
  userId,
  templateId,
  event,
  tags,
}: {
  workspaceId: string;
  userId: string;
  templateId: string | null;
  event: QuoWebhookEvent;
  tags?: MessageTags;
}): Promise<Result<void, Error>> {
  let eventName: InternalEventType;
  switch (event.type) {
    case QuoWebhookEventType.MessageDelivered:
      eventName = InternalEventType.SmsDelivered;
      break;
    case QuoWebhookEventType.MessageFailed:
    case QuoWebhookEventType.MessageUndelivered:
      eventName = InternalEventType.SmsFailed;
      break;
    case QuoWebhookEventType.MessageReceived:
      logger().debug(
        {
          workspaceId,
          event,
        },
        "Ignoring message.received Quo webhook event.",
      );
      return ok(undefined);
    default:
      logger().error(
        {
          workspaceId,
          event,
        },
        "Unhandled Quo event type",
      );
      return err(new Error(`Unhandled Quo event type: ${String(event.type)}`));
  }

  const messageId = uuidv5(
    `${event.type}:${event.data.resource.id}`,
    workspaceId,
  );

  const item = {
    type: EventType.Track,
    event: eventName,
    userId,
    messageId,
    properties: {
      workspaceId,
      userId,
      templateId,
      errorCode: event.data.resource.errorCode ?? undefined,
      ...tags,
    },
  } as BatchTrackData;

  try {
    await submitBatch({
      workspaceId,
      data: {
        context: {
          source: SourceType.Webhook,
          provider: SmsProviderType.Quo,
        },
        batch: [item],
      },
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(e as string));
  }
  return ok(undefined);
}

export async function getQuoMessageCorrelation({
  messageId,
}: {
  messageId: string;
}) {
  return db().query.quoMessageCorrelation.findFirst({
    where: eq(quoMessageCorrelation.messageId, messageId),
  });
}
