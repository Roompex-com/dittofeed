# Brief: `audience` field on user property definitions

Work on branch `roompex-property-audience`, cut FLAT from the current integration branch at time of start (the wayfinder map owns which branch that is). ADDITIVE only. Small, focused change — mirror the template `audience` work (migration 0012, `docs/tasks/template-audience-brief.md`) and the `replicateToChildren` pattern (migration 0011, `docs/tasks/shared-properties-brief.md`) exactly.

## Context (why)

Roompex templates carry an `audience` tag (lead/tenant/landlord/vendor/member; null = any). User property definitions currently have no audience, so the template editor's variable surfaces show EVERY workspace property for every template — a vendor template offers `rentDueDay`, a tenant template offers `vendorServiceType`. This change scopes property definitions by audience so editor surfaces show only: properties tagged with the template's audience + properties with no audience (universal).

Semantics (locked 2026-10-25): `audience` on a UserProperty is **display/materialization scoping, not a new entity model**. Per-message context data (work orders, roommate lists, statements) does NOT get definitions — it passes as nested `ctx_*` per-recipient overrides on batch-send (verified rendering 2026-10-25: nested objects, array indexing, and `{% for %}` all work through `/api/admin/content/templates/render`). Do not build context-variable features in this change.

## Read BEFORE writing code

1. This brief.
2. How template `audience` was added: `git log --oneline | grep -i audience` → `git show` that commit. Touches: `packages/backend-lib/src/db/schema.ts`, migration `0012_*` + drizzle meta, `packages/isomorphic-lib/src/types.ts` (MessageTemplateResource), `packages/backend-lib/src/messageTemplates.ts` + `messageTemplates.audience.test.ts`, `packages/api/src/controllers/contentController.ts` (templates GET/PUT, `audience` filter at ~line 211).
3. UserProperty model: `userProperty` pgTable (schema.ts ~line 182), `UserPropertyResource` / `SavedUserPropertyResource` / `UpsertUserPropertyResource` (isomorphic-lib types.ts ~line 2625), `packages/backend-lib/src/userProperties.ts` (helpers + `userProperties.replication.test.ts`), `packages/api/src/controllers/userPropertiesController.ts`.
4. Replication: how Tier-1 shared properties replicate to child workspaces (`replicateToChildren`); the new column must ride along.
5. Dashboard: `packages/dashboard/src/components/templateEditor.tsx` — `getUserPropertyValue` (~line 288) builds example assignments from the `userProperties` list; the "User Properties" JSON test panel (~line 1413); the same list is handed to the channel editors (email/sms/webhook). `userPropertiesTable.tsx` — the properties admin table where the audience selector goes.

## Deliverables

1. Migration `0013_*` + drizzle meta: nullable `audience` text column on `userProperty`. Schema.ts updated.
2. isomorphic-lib: optional `audience` on `UserPropertyResource` (flows into Saved/Upsert types). Free text, no enum enforcement — same vocabulary as template audience (lead/tenant/landlord/vendor/member; null = universal).
3. backend-lib `userProperties.ts`: persist on upsert (absent field never clobbers — same rule as templates), return on read; carry the column through the child-workspace replication path.
4. API: `userPropertiesController` GET/PUT pass the field through. No new query filter needed — Manager callers can filter client-side (say in the PR notes if you deviate).
5. Dashboard `userPropertiesTable.tsx`: small "Audience" select on the property edit/create form — values Any (null) / Lead / Tenant / Landlord / Vendor / Member — matching the template editor's existing audience select styling; display the value as a column or chip in the table if trivial.
6. Dashboard `templateEditor.tsx`: filter the `userProperties` list ONCE at its source (memoized) by the edited template's `audience`: keep `property.audience === null || property.audience === template.audience`; when `template.audience` is null keep everything. The filtered list must feed all consumers: channel editors, the variable insertion UI, and the User Properties JSON test panel's seeded example values.
7. Container-free unit test mirroring `messageTemplates.audience.test.ts`: upsert round-trip + absent-field no-clobber, at the type/lib level.

## Acceptance criteria (literal)

- Migration 0013 exists with the column; drizzle schema + meta updated; `schema.ts` `userProperty` table has `audience`.
- `grep -rn "audience" packages/isomorphic-lib/src/types.ts` shows it on UserPropertyResource, not just MessageTemplateResource.
- With a property tagged `audience: "vendor"` and a template tagged `audience: "tenant"`: the template editor's variable list and the JSON test panel do NOT offer the vendor property; a null-audience property IS offered; a template with null audience offers all.
- Replication to a child workspace preserves `audience`.
- All four `yarn workspace {isomorphic-lib,backend-lib,api,dashboard} run check` exit 0; no new eslint errors.
- `git diff --stat` touches only: schema/migration/meta, isomorphic types, userProperties lib + test, userPropertiesController, templateEditor.tsx, userPropertiesTable.tsx.

## Do not

- Do not change segment/computed-property evaluation or identify materialization in this change — display scoping only (tightening materialization is a possible later step, evaluate then).
- Do not add any `ctx_*` / context-variable machinery — context rides existing batch-send overrides.
- Do not touch templates audience logic (already shipped), folders, Quo, embed code.
- Do not commit; leave changes in the working tree.
