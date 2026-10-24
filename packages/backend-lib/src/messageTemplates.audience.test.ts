import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  ChannelType,
  MessageTemplateResource,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";

import { messageTemplate as dbMessageTemplate } from "./db/schema";

describe("messageTemplates audience", () => {
  const baseResource = {
    id: "f0e1d2c3-b4a5-6789-0abc-def012345678",
    workspaceId: "workspace-id",
    name: "Rent Reminder",
    type: ChannelType.Email,
    updatedAt: 0,
  };

  describe("isomorphic-lib types", () => {
    it("accepts audience on the upsert request", () => {
      const result = schemaValidateWithErr(
        {
          workspaceId: "workspace-id",
          name: "Rent Reminder",
          audience: "tenant",
        },
        UpsertMessageTemplateResource,
      );
      expect(result.isOk()).toBe(true);
    });

    it("still accepts an upsert request without audience", () => {
      const result = schemaValidateWithErr(
        { workspaceId: "workspace-id", name: "Rent Reminder" },
        UpsertMessageTemplateResource,
      );
      expect(result.isOk()).toBe(true);
    });

    it("accepts a null audience on the upsert request", () => {
      const result = schemaValidateWithErr(
        {
          workspaceId: "workspace-id",
          name: "Rent Reminder",
          audience: null,
        },
        UpsertMessageTemplateResource,
      );
      expect(result.isOk()).toBe(true);
    });

    it("accepts audience on the template resource response", () => {
      const result = schemaValidateWithErr(
        { ...baseResource, audience: "tenant" },
        MessageTemplateResource,
      );
      expect(result.isOk()).toBe(true);
      result.map((resource) => expect(resource.audience).toBe("tenant"));
    });
  });

  describe("drizzle schema", () => {
    it("defines audience as a nullable text column", () => {
      const column = dbMessageTemplate.audience;
      expect(column.name).toBe("audience");
      expect(column.notNull).toBe(false);
      expect(column.default).toBeUndefined();
    });
  });
});
