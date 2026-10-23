import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db } from "../db";
import { quoMessageCorrelation } from "../db/schema";
import { createWorkspace } from "../workspaces";
import { sendSms } from "./quo";

describe("destinations/quo", () => {
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    const ws = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `test-${randomUUID()}`,
        updatedAt: new Date(),
      }),
    );
    workspaceId = ws.id;
    userId = `user-${randomUUID()}`;
  });

  describe("sendSms", () => {
    it("should persist a QuoMessageCorrelation row on a successful send", async () => {
      const quoMessageId = `AC${randomUUID()}`;
      jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: { id: quoMessageId } }), {
          status: 202,
        }),
      );

      const templateId = randomUUID();
      const result = await sendSms({
        apiKey: "test-api-key",
        from: "+15550000000",
        to: "+15551111111",
        body: "hello from quo test",
        workspaceId,
        userId,
        templateId,
      });

      expect(result.isOk()).toBe(true);

      const correlation = await db().query.quoMessageCorrelation.findFirst({
        where: eq(quoMessageCorrelation.messageId, quoMessageId),
      });
      expect(correlation).toBeDefined();
      expect(correlation?.workspaceId).toBe(workspaceId);
      expect(correlation?.userId).toBe(userId);
      expect(correlation?.templateId).toBe(templateId);
    });

    it("should not persist a correlation row when Quo rejects the send", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ error: "A2P Registration Not Approved" }),
          {
            status: 400,
          },
        ),
      );

      const result = await sendSms({
        apiKey: "test-api-key",
        from: "+15550000000",
        to: "+15551111111",
        body: "hello from quo test",
        workspaceId,
        userId,
      });

      expect(result.isErr()).toBe(true);

      const correlations = await db().query.quoMessageCorrelation.findMany({
        where: eq(quoMessageCorrelation.workspaceId, workspaceId),
      });
      expect(correlations).toHaveLength(0);
    });
  });
});
