import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  SavedUserPropertyResource,
  UpsertUserPropertyResource,
  UserPropertyDefinitionType,
  UserPropertyResource,
} from "isomorphic-lib/src/types";

import { userProperty as dbUserProperty } from "./db/schema";

describe("userProperties audience", () => {
  const baseResource = {
    id: "f0e1d2c3-b4a5-6789-0abc-def012345678",
    workspaceId: "workspace-id",
    name: "email",
    definition: {
      type: UserPropertyDefinitionType.Trait,
      path: "email",
    },
    updatedAt: 0,
    createdAt: 0,
    definitionUpdatedAt: 0,
  };

  describe("isomorphic-lib types", () => {
    it("accepts audience on the upsert request", () => {
      const result = schemaValidateWithErr(
        {
          workspaceId: "workspace-id",
          name: "email",
          audience: "vendor",
        },
        UpsertUserPropertyResource,
      );
      expect(result.isOk()).toBe(true);
    });

    it("still accepts an upsert request without audience", () => {
      const result = schemaValidateWithErr(
        { workspaceId: "workspace-id", name: "email" },
        UpsertUserPropertyResource,
      );
      expect(result.isOk()).toBe(true);
    });

    it("accepts a null audience on the upsert request", () => {
      const result = schemaValidateWithErr(
        {
          workspaceId: "workspace-id",
          name: "email",
          audience: null,
        },
        UpsertUserPropertyResource,
      );
      expect(result.isOk()).toBe(true);
    });

    it("accepts audience on the user property resource response", () => {
      const result = schemaValidateWithErr(
        { ...baseResource, audience: "vendor" },
        UserPropertyResource,
      );
      expect(result.isOk()).toBe(true);
      result.map((resource) => expect(resource.audience).toBe("vendor"));
    });

    it("accepts audience on the saved user property resource response", () => {
      const result = schemaValidateWithErr(
        { ...baseResource, audience: "vendor" },
        SavedUserPropertyResource,
      );
      expect(result.isOk()).toBe(true);
      result.map((resource) => expect(resource.audience).toBe("vendor"));
    });
  });

  describe("drizzle schema", () => {
    it("defines audience as a nullable text column", () => {
      const column = dbUserProperty.audience;
      expect(column.name).toBe("audience");
      expect(column.notNull).toBe(false);
      expect(column.default).toBeUndefined();
    });
  });
});
