import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  SavedUserPropertyResource,
  UpsertUserPropertyResource,
  UserPropertyDefinitionType,
} from "isomorphic-lib/src/types";

import { userProperty as dbUserProperty } from "./db/schema";

describe("userProperties replicateToChildren", () => {
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
    it("accepts replicateToChildren on the upsert request", () => {
      const result = schemaValidateWithErr(
        {
          workspaceId: "workspace-id",
          name: "email",
          replicateToChildren: true,
        },
        UpsertUserPropertyResource,
      );
      expect(result.isOk()).toBe(true);
    });

    it("still accepts an upsert request without replicateToChildren", () => {
      const result = schemaValidateWithErr(
        { workspaceId: "workspace-id", name: "email" },
        UpsertUserPropertyResource,
      );
      expect(result.isOk()).toBe(true);
    });

    it("accepts replicateToChildren on the saved resource response", () => {
      const result = schemaValidateWithErr(
        { ...baseResource, replicateToChildren: true },
        SavedUserPropertyResource,
      );
      expect(result.isOk()).toBe(true);
      result.map((resource) => expect(resource.replicateToChildren).toBe(true));
    });
  });

  describe("drizzle schema", () => {
    it("defines replicateToChildren as not null defaulting to false", () => {
      const column = dbUserProperty.replicateToChildren;
      expect(column.name).toBe("replicateToChildren");
      expect(column.notNull).toBe(true);
      expect(column.default).toBe(false);
    });
  });
});
