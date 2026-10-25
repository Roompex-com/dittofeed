# Brief: fork dashboard — mandatory folders on create, deliveries fixes

Branch `roompex-dashboard-fixes` (cut from `roompex-dashboard-collapse`). Four focused changes.

## Read first
- `packages/dashboard/src/components/folders/` (NewFolderDialog, folderControls — existing selector UI to reuse), the four list tables' "New *" dialogs/flows (grep `NewTemplateDialog` / "New Template" / new-segment / new-journey / new-broadcast UI in packages/dashboard/src).
- `packages/dashboard/src/components/deliveries/deliveriesTableV2.tsx` (+ its directory) — the deliveries table used in the embedded page. Also `packages/dashboard/src/pages/embed/deliveries.page.tsx` for embed context detection.

## Deliverables

1. **Mandatory folder on create**: every "New Template", "New Segment", "New Journey", "New Broadcast" creation flow must include a **required folder selector** (dropdown of that resource type's folders; create blocked with inline validation until chosen). Reuse the existing folder-select UI where possible.
2. **Deliveries — SMS From column**: show the sender's phone number in From for SMS deliveries. Inspect what the delivery rows carry (`sendTo`, template/provider info via the table's data hooks). If a per-message from is not stored in the delivery data, fall back to the workspace's default SMS provider from-number (lookup used by settings UI) — state which path you implemented.
3. **Deliveries — links open the FULL dashboard, not embedded routes**: in the deliveries table, the template link and the user link must resolve to the full dashboard (`/dashboard/...`) — and open in a new tab (`target="_blank"`). Embedded deliveries page: remove the "View user profile" link entirely (keep it in the full dashboard version). Detect embedded context via the route (`/embed` prefix in router pathname) — an existing pattern in `authModeProvider.ts`/universalRouter.
4. Nothing else in the deliveries table changes.

## Acceptance
- `yarn workspace dashboard run check` 0; no new eslint errors on touched files.
- `git diff --stat`: the New * dialogs, folder controls (if shared selector added), deliveries table (+embed page if needed), this brief.
- Do not commit.
