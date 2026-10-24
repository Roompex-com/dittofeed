# Brief: `replicateToChildren` flag on user properties

Work on branch `roompex-shared-properties` (already checked out, cut from `roompex-folders`). ADDITIVE only. This is part 1 of the provisioning build — the seeder itself comes later; here we add the flag machinery only.

## Read BEFORE writing code

1. This brief.
2. `packages/backend-lib/src/db/schema.ts` (`UserProperty` table), recent migrations in `packages/backend-lib/drizzle/` for style (next number after 0010).
3. `packages/api/src/controllers/userPropertiesController.ts` — GET/PUT shapes for user properties.
4. The dashboard user-properties page (grep `packages/dashboard/src/pages` for the user properties settings page; it lists properties with name + type and lets you create/select them).

## Deliverables

1. Migration + drizzle schema: `replicateToChildren boolean NOT NULL DEFAULT false` on the `UserProperty` table.
2. API: the field is accepted (optional) on the user-properties upsert and returned in GETs (isomorphic-lib types included).
3. Dashboard: a "Replicate to companies" toggle/switch per property on the user-properties settings page (small, matching the page's existing components; no redesign). Label helper text: "Included when provisioning new company workspaces".
4. Lib helper in `packages/backend-lib/src/userProperties.ts` (or where properties live): `getReplicatedProperties({ workspaceId })` returning properties where the flag is true — for the future seeder.
5. Unit tests where infra allows (pure schema/type level; no container-dependent tests — note if skipped).

## Acceptance criteria (literal)

- Migration file exists (next sequential number); `replicateToChildren` column on `UserProperty` in schema.ts.
- `grep -rn "replicateToChildren" packages/isomorphic-lib/src/types.ts` shows upsert+response types.
- Toggle renders on the user-properties page (code compiles; runtime verified later).
- `yarn workspace {isomorphic-lib,backend-lib,api,dashboard} run check` all exit 0; no new eslint errors on touched files.
- `git diff --stat` touches only: schema/migration, isomorphic-lib types, userProperties lib, userPropertiesController, the dashboard user-properties page (+ minimal shared UI if strictly needed).

## Do not

- Do not implement the seeder, provisioning endpoint, or sync actions (later brief).
- Do not flag any properties in code — flags are set in the parent workspace as data (a follow-up data step flips the Tier-1 set).
- Do not commit; leave changes in the working tree.
