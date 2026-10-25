# Brief: group-aware pagination in the templates table

Branch `roompex-group-pagination`, cut FLAT from `roompex-property-audience` (current HEAD, clean tree). Single-package change (dashboard).

## Context (verified live 2026-10-25)

`packages/dashboard/src/components/messages/templatesTable.tsx` renders rows grouped under collapsible folder headers (fork feature). Pagination uses stock `getPaginationRowModel()` with `pageSize: 10` over the FLAT sorted list, so a page boundary can slice through an expanded folder group: with the live workspace (Ad-hoc folder 8 templates, Lead Nurturing 3, root 1), page 1 ends mid-group — the expanded "Lead Nurturing (3)" header shows only 2 of its 3 rows and the third lands on page 2, while the group header repeats on every page. Users read this as a lost template (user-reported bug).

## Deliverables

1. Replace the stock pagination slicing with **group-aware paging** computed from the table's sorted row model: partition rows into contiguous folder groups (rows are already sorted with `folderId` as the enforced primary sort — see `handleSortingChange`); build pages by adding WHOLE groups; start a new page when the current page is non-empty and the next group would exceed `pageSize`; a group larger than `pageSize` alone starts on a fresh page and may span multiple pages (header repeat acceptable ONLY in this case).
2. Footer `Page X of Y` and First/Previous/Next/Last must use the group-aware page count (not `ceil(totalRows / pageSize)`); clamp `pageIndex` when the page count shrinks (folder filter change, group collapse) — never render an empty page while data exists.
3. Everything else unchanged: sorting, folder filter sidebar (single-folder view shows all that folder's rows — trivially satisfied since it is one group), move-to-folder, duplicate/delete actions, collapsible headers, count badges.
4. Implementation freedom: custom pagination row model, or compute the page slice in a memo from the sorted rows and drive the footer from it — either is fine; keep the change contained to `templatesTable.tsx` (touch `folderControls.tsx` only if strictly required).

## Acceptance criteria (literal)

- Simulated live data shape (8-row folder, 3-row folder, 1 root row), page size 10, All Folders view: NO page boundary splits a folder group — the 3-row group's rows all appear on the same page.
- Footer shows the group-aware page count and navigation respects it.
- Selecting a single folder in the sidebar filter: all its rows on one page, one page total.
- Collapsing/expanding groups never leaves a stale pageIndex on an empty page.
- `yarn workspace dashboard run check` exit 0; no new eslint errors on touched files.
- `git diff --stat` touches only `templatesTable.tsx` (± `folderControls.tsx`).

## Do not

- Do not change pageSize, sorting defaults, folder filter logic, count badges, or any other table (segments/journeys/broadcasts) — those lists have the same pattern but are NOT in scope.
- Do not commit; leave changes in the working tree.
