# Fix brief: deliveries template link stays embedded when in embed context

Branch `roompex-dashboard-fixes` (checked out). Reverts part of the previous link change — the template link must NOT open the full site when the user is IN the embedded deliveries page.

## Current (wrong) behavior
In `packages/dashboard/src/components/deliveriesTableV2/deliveriesBody.tsx`, the template link renders as a plain `<a href="/dashboard/..." target="_blank">` unconditionally.

## Wanted
- **Embedded context** (route pathname starts with `/embed` — same detection the file already uses for hiding the user-profile link): the template link navigates IN-FRAME to the embedded template editor. Use the existing `useUniversalRouter().push` / `mapUrl` pattern from `packages/dashboard/src/lib/authModeProvider.ts`, which already prefixes `/embed` when rendering under embed pages — i.e. navigate to the template editor path (whatever the full dashboard uses, e.g. `/templates/{id}`) via the universal router so it resolves to `/embed/templates/{id}` in the embed. Do NOT use target/_blank here.
- **Full dashboard**: link behaves as the original upstream behavior did (in-app navigation to the template editor).
- **User link**: keep as-is from the previous change (full-site `/dashboard/...` Users page, new tab) — do not touch.

## Acceptance
- `yarn workspace dashboard run check` 0; no new eslint errors; only deliveriesBody.tsx (+ this brief) changed; do not commit.
