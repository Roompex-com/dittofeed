# Brief: Folders/grouping for Templates, Journeys, Segments, Broadcasts

Work on branch `roompex-folders` (already checked out, cut from `roompex` baseline — NOT from the quo-provider branch). Purely ADDITIVE changes; no refactors; keep separable from upstream.

## Read BEFORE writing code

1. This brief.
2. The four list pages and their controllers: grep `packages/dashboard/src/pages` for templates/journeys/segments/broadcasts pages; corresponding controllers under `packages/api/src/controllers/`.
3. Existing drizzle schema patterns: `packages/backend-lib/src/db/schema.ts`, `relations.ts`, and recent migrations in `packages/backend-lib/drizzle/` (e.g. `0009_amused_chat.sql` for style).

## Design (decided — do not deviate)

- ONE new table `ContentFolder`: `id` (uuid PK), `name` (string), `workspaceId` (uuid, FK cascade), `resourceType` (enum: `Template` | `Journey` | `Segment` | `Broadcast` — follow the repo's existing enum conventions), `createdAt`/`updatedAt` if the repo convention has them.
- Nullable `folderId` (uuid, FK to ContentFolder, ON DELETE SET NULL is NOT allowed — deletes are blocked instead; use plain FK with cascade behavior matching repo style for workspace) on the `templates`, `journeys`, `segments`, `broadcasts` tables. Items with null folderId show in an implicit root.
- NO nesting in v1.

## Deliverables

1. Drizzle schema + relations + migration for the above (follow the repo's migration numbering/format).
2. API: `GET /api/admin/content/folders` (query: `workspaceId` + `resourceType`; returns list), `PUT /api/admin/content/folders` (upsert: `{workspaceId, id?, name, resourceType}` — follow the templates upsert controller's auth/scoping style exactly), `DELETE /api/admin/content/folders` (query id; **409/blocked if any resource of that folder's type references it** — check count first, return a clear error). Add a new controller or extend contentController — follow repo file conventions.
3. `folderId` accepted on the upsert request types AND returned in responses for templates, journeys, segments, broadcasts (update the isomorphic-lib request/response types; the templates `PUT /api/admin/content/templates` accepts `{workspaceId, id?, name, ...}` — add optional `folderId`).
4. Dashboard UI, minimal: in each of the four list pages add (a) a folder filter dropdown in the toolbar (All folders / root / each folder), (b) list items grouped under folder headers (folder name as a section header; root items under no header or "Unfiled"), (c) a "Move to folder" action in each row's existing menu (or equivalent). A small "New folder" affordance in the same dropdown. Match the existing UI component library/style of these pages — reuse their select/menu components. Do NOT redesign the pages.
5. Isomorphic-lib types for all of the above.

## Acceptance criteria (literal)

- Migration file exists and follows repo numbering; `content_folders` table + 4 nullable `folderId` columns.
- `grep -rn "folderId" packages/isomorphic-lib/src/types.ts` shows request+response fields for all four resources.
- Folders API routes exist and are workspace-scoped like the templates routes (same auth pattern).
- DELETE on a non-empty folder returns an error; moving items out then deleting succeeds (logic present in code; runtime test deferred).
- `yarn workspace {isomorphic-lib,backend-lib,api,dashboard} run check` all exit 0; eslint on touched files adds zero errors vs HEAD baseline.
- `git diff --stat` only touches: schema/relations/migration, the folders controller, the four resource controllers + their types, the four list pages, shared UI components if strictly needed. No secret values.

## Do not

- Do not touch the Quo provider files (they live on another branch).
- Do not implement nesting, drag-and-drop, or two-pane trees.
- Do not commit; leave changes in the working tree.
