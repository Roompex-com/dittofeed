# Brief: `audience` field on message templates

Work on branch `roompex-template-audience` (already checked out, cut from `roompex-shared-properties`). ADDITIVE only. Small, focused change — mirror the `replicateToChildren` pattern exactly.

## Read BEFORE writing code

1. This brief.
2. How `replicateToChildren` was added (git show 8c621c2e): `packages/backend-lib/src/db/schema.ts` (UserProperty column), migration `0011_shared_properties.sql` + meta, `packages/isomorphic-lib/src/types.ts` (UserPropertyResource), the dashboard `userPropertiesTable.tsx` toggle, `backend-lib/src/userProperties.ts` helpers.
3. Template model: `MessageTemplate` in schema.ts; template resources in `isomorphic-lib/src/types.ts` (MessageTemplateResource / UpsertMessageTemplateRequest); `backend-lib/src/messageTemplates.ts`; `packages/api/src/controllers/contentController.ts` (templates GET/PUT).
4. Dashboard template editor: find where template name/settings are edited (grep `packages/dashboard/src` for the template edit drawer/page).

## Deliverables

1. Migration 0012 + drizzle schema: nullable `audience` text column on `MessageTemplate`.
2. isomorphic-lib: optional `audience` on MessageTemplateResource (and therefore upsert + response types). No enum type enforcement at schema level — free text like personType vocab (lead/tenant/landlord/vendor/member; null = any).
3. Upsert persists it (absent field never clobbers); GET returns it. Optional `audience` query filter on the templates GET (exact match; the Manager side needs `null` OR value — if filtering nulls is awkward in the query layer, return all and let the caller filter; say which you did).
4. Dashboard template editor: a small optional "Audience" select (values: Any (null), Lead, Tenant, Landlord, Vendor, Member) on the template settings/edit surface — minimal, matching existing form controls.
5. Unit test for upsert/response round-trip at the type level (container-free), mirroring the replication test.

## Acceptance criteria (literal)

- Migration 0012 exists with the column; schema.ts updated.
- `grep -rn "audience" packages/isomorphic-lib/src/types.ts` shows the template resource fields.
- All four `yarn workspace {isomorphic-lib,backend-lib,api,dashboard} run check` exit 0; no new eslint errors.
- `git diff --stat` touches only: schema/migration/meta, isomorphic types, messageTemplates lib, contentController templates routes, the template editor UI, the new test.

## Do not

- Do not touch user properties, folders, Quo, or embed code.
- Do not commit; leave changes in the working tree.
