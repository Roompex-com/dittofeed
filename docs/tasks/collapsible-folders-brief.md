# Fix brief: collapsible folder groups in dashboard lists (dittofeed fork)

Branch `roompex-dashboard-collapse` (already checked out, cut from `roompex-template-audience`). The fork's folder feature renders folder groups as static section headers in the four list tables. Make them COLLAPSIBLE and COLLAPSED BY DEFAULT.

## Where
The four list tables that render folder grouping (added in commit 8ab48b01, the folders feature): `packages/dashboard/src/components/messages/templatesTable.tsx`, `packages/dashboard/src/components/segments/segmentsTable.tsx`, `packages/dashboard/src/components/journeys/v2/journeysTable.tsx`, `packages/dashboard/src/components/broadcasts/indexTable.tsx` — find the grouped rendering (group header rows for folderName) and any shared grouping helper they use. If the grouping logic is duplicated across the four, extract or patch each — smallest change wins, but behavior must be consistent.

## Behavior
- Folder header row becomes a toggle button: chevron icon (right when collapsed, down when expanded) + folder name (+ item count), full-row click target, keyboard accessible.
- All folders collapsed by default on each table load (unfiled/root items — those with null folderId rendered outside any group — remain visible as today; only folder groups collapse).
- State is local component state (no persistence needed).
- Match the tables' existing styling (MUI DataGrid or custom rows — whatever the current grouping renders, keep it; just add the toggle).

## Acceptance
- `yarn workspace dashboard run check` exit 0; no new eslint errors on touched files.
- `git diff --stat` touches only the grouping code in those four tables (+ a tiny shared component if extracted, e.g. under packages/dashboard/src/components/folders/).
- Do not commit.
