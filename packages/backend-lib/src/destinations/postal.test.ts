import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { v5 as uuidv5 } from "uuid";

import { EventType, InternalEventType } from "../types";
import { PostalWebhookBody, postalWebhookEventToBatchItem } from "./postal";

const workspaceId = "8f6c2f42-9d3e-4a7b-b5c1-1e2d3f4a5b6c";

interface MappingRow {
  postalMessageId: number;
  workspaceId: string;
  userId: string;
  messageId: string;
  templateId: string | null;
  journeyId: string | null;
  nodeId: string | null;
  broadcastId: string | null;
  runId: string | null;
  createdAt: Date;
}

function baseMapping(overrides?: Partial<MappingRow>): MappingRow {
  return {
    postalMessageId: 123,
    workspaceId,
    userId: "user-1",
    messageId: "origin-message-id",
    templateId: "template-1",
    journeyId: null,
    nodeId: null,
    broadcastId: null,
    runId: null,
    createdAt: new Date("2026-10-26T00:00:00.000Z"),
    ...overrides,
  };
}

function unwrapTrackItem(
  result: ReturnType<typeof postalWebhookEventToBatchItem>,
) {
  expect(result.isOk()).toBe(true);
  const item = unwrap(result);
  if (!item || item.type !== EventType.Track || !("userId" in item)) {
    throw new Error("expected track batch item");
  }
  return item;
}

describe("postalWebhookEventToBatchItem", () => {
  it("maps MessageSent to DFEmailDelivered with origin messageId and recipient email", () => {
    const item = unwrapTrackItem(
      postalWebhookEventToBatchItem({
        body: {
          event: "MessageSent",
          timestamp: 1793000000,
          uuid: "sent-uuid",
          payload: {
            status: "Sent",
            output: "Sent",
            message: {
              id: 123,
              to: "john.smith123@gmail.com",
            },
          },
        },
        mapping: baseMapping(),
      }),
    );
    expect(item.event).toBe(InternalEventType.EmailDelivered);
    expect(item.userId).toBe("user-1");
    expect(item.messageId).toBe(uuidv5(`MessageSent:sent-uuid`, workspaceId));
    expect(item.timestamp).toBe(new Date(1793000000 * 1000).toISOString());
    expect(item.properties?.messageId).toBe("origin-message-id");
    expect(item.properties?.email).toBe("john.smith123@gmail.com");
    expect(item.properties?.workspaceId).toBe(workspaceId);
    expect(item.properties?.templateId).toBe("template-1");
    expect(item.properties?.output).toBe("Sent");
  });

  it("maps MessageDeliveryFailed to DFEmailBounced with hard bounceType", () => {
    const item = unwrapTrackItem(
      postalWebhookEventToBatchItem({
        body: {
          event: "MessageDeliveryFailed",
          timestamp: 1793000001,
          uuid: "failed-uuid",
          payload: {
            status: "PermanentError",
            output: "550 5.1.1 mailbox unavailable",
            details: "bounced",
            message: {
              id: 123,
              to: "john.smith123@gmail.com",
            },
          },
        },
        mapping: baseMapping(),
      }),
    );
    expect(item.event).toBe(InternalEventType.EmailBounced);
    expect(item.properties?.bounceType).toBe("hard");
    expect(item.properties?.output).toBe("550 5.1.1 mailbox unavailable");
    expect(item.properties?.details).toBe("bounced");
  });

  it("maps MessageBounced to DFEmailBounced correlating on original_message id", () => {
    const item = unwrapTrackItem(
      postalWebhookEventToBatchItem({
        body: {
          event: "MessageBounced",
          timestamp: 1793000002,
          payload: {
            status: "Bounced",
            output: "550 5.1.1 user unknown",
            message: {
              id: 456,
              to: "john.smith123@gmail.com",
            },
            original_message: {
              id: 123,
              to: "john.smith123@gmail.com",
            },
          },
        },
        // mapping is looked up by original_message.id, not message.id
        mapping: baseMapping({ postalMessageId: 123 }),
      }),
    );
    expect(item.event).toBe(InternalEventType.EmailBounced);
    // no uuid on the envelope, so the postal message id is the dedupe key
    expect(item.messageId).toBe(uuidv5(`MessageBounced:123`, workspaceId));
    expect(item.properties?.bounceType).toBe("bounce");
    expect(item.properties?.messageId).toBe("origin-message-id");
    expect(item.properties?.email).toBe("john.smith123@gmail.com");
  });

  it("maps MessageHeld to DFEmailDropped", () => {
    const item = unwrapTrackItem(
      postalWebhookEventToBatchItem({
        body: {
          event: "MessageHeld",
          timestamp: 1793000003,
          uuid: "held-uuid",
          payload: {
            status: "Held",
            output: "held by spam rule",
            message: {
              id: 123,
              to: "john.smith123@gmail.com",
            },
          },
        },
        mapping: baseMapping(),
      }),
    );
    expect(item.event).toBe(InternalEventType.EmailDropped);
    expect(item.properties?.output).toBe("held by spam rule");
  });

  it("maps MessageLoaded to DFEmailOpened with ipAddress", () => {
    const item = unwrapTrackItem(
      postalWebhookEventToBatchItem({
        body: {
          event: "MessageLoaded",
          timestamp: 1793000004,
          uuid: "loaded-uuid",
          payload: {
            ip_address: "192.168.1.100",
            user_agent: "Mozilla/5.0",
            message: {
              id: 123,
              to: "john.smith123@gmail.com",
            },
          },
        },
        mapping: baseMapping(),
      }),
    );
    expect(item.event).toBe(InternalEventType.EmailOpened);
    expect(item.properties?.ipAddress).toBe("192.168.1.100");
    expect(item.properties?.userAgent).toBe("Mozilla/5.0");
  });

  it("maps MessageLinkClicked to DFEmailClicked with url", () => {
    const item = unwrapTrackItem(
      postalWebhookEventToBatchItem({
        body: {
          event: "MessageLinkClicked",
          timestamp: 1793000005,
          uuid: "clicked-uuid",
          payload: {
            ip_address: "192.168.1.100",
            user_agent: "Mozilla/5.0",
            url: "https://example.com",
            message: {
              id: 123,
              to: "john.smith123@gmail.com",
            },
          },
        },
        mapping: baseMapping(),
      }),
    );
    expect(item.event).toBe(InternalEventType.EmailClicked);
    expect(item.properties?.url).toBe("https://example.com");
  });

  it("skips MessageDelayed and DomainDNSError events", () => {
    for (const event of ["MessageDelayed", "DomainDNSError"] as const) {
      const result = postalWebhookEventToBatchItem({
        body: {
          event,
          timestamp: 1793000006,
          uuid: `${event}-uuid`,
          payload: {
            message: {
              id: 123,
              to: "john.smith123@gmail.com",
            },
          },
        },
        mapping: baseMapping(),
      });
      expect(result.isOk()).toBe(true);
      expect(unwrap(result)).toBeNull();
    }
  });

  it("derives a stable messageId from the envelope uuid and differentiates events", () => {
    const makeBody = (
      event: PostalWebhookBody["event"],
    ): PostalWebhookBody => ({
      event,
      timestamp: 1793000007,
      uuid: "same-uuid",
      payload: {
        message: {
          id: 123,
          to: "john.smith123@gmail.com",
        },
      },
    });
    const firstItem = unwrapTrackItem(
      postalWebhookEventToBatchItem({
        body: makeBody("MessageSent"),
        mapping: baseMapping(),
      }),
    );
    const secondItem = unwrapTrackItem(
      postalWebhookEventToBatchItem({
        body: makeBody("MessageSent"),
        mapping: baseMapping(),
      }),
    );
    const otherItem = unwrapTrackItem(
      postalWebhookEventToBatchItem({
        body: makeBody("MessageLoaded"),
        mapping: baseMapping(),
      }),
    );
    expect(firstItem.messageId).toBe(secondItem.messageId);
    expect(firstItem.messageId).not.toBe(otherItem.messageId);
  });
});
