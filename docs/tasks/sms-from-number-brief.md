# Brief: expose workspace SMS from-number for deliveries display

Branch `roompex-dashboard-fixes` (checked out). Small, focused. Context: deliveries From column currently shows the default SMS provider NAME because secrets have no read API. The from-number is not sensitive (it appears on every outbound SMS) — expose it for the deliveries table.

## Read first
- `packages/api/src/controllers/settingsController.ts` (the `/sms-providers/default` GET route and `upsertSmsProvider`/`getSmsProviders` in `backend-lib/src/messaging/sms.ts` — how the default provider + its secret row are resolved).
- `packages/dashboard/src/components/deliveriesTableV2/deliveriesBody.tsx` + `packages/dashboard/src/pages/deliveries.page.tsx` — where the provider name fallback was just implemented.

## Deliverables
1. `GET /api/settings/sms-from-number?workspaceId=...` in settingsController (same route family/auth as other settings GETs): resolve the workspace's default SMS provider → its secret row → return `{ from: <configValue.from or value, string|null> }`. null when no default/no from configured. No other secret fields.
2. Deliveries: where the From fallback was implemented, fetch this endpoint server-side (SSR seeding like the existing provider lookup) and display the actual number when non-null; keep provider name as fallback.
3. isomorphic-lib types for the response.

## Acceptance
- All four `yarn workspace {isomorphic-lib,backend-lib,api,dashboard} run check` exit 0; no new eslint errors.
- `git diff --stat`: settingsController, isomorphic types, sms lib (if a helper is added there), deliveries components/page, this brief.
- Do not commit.
