# Brief: Embedded components — fork side (token-authed /embed routes)

Work on branch `roompex-folders` (already checked out, contains committed Quo + folders work). ADDITIVE only.

## Goal

Re-expose five existing dashboard capabilities as embeddable, token-authed, chrome-free pages, so Manager (external app) can iframe them per company workspace: **Templates (list + editor), Segments (list + editor), Journeys (list + editor), Broadcasts (list + editor), Deliveries (table)**.

## Design (decided — implement this, explore the code to find seams)

Two mechanisms, both required:

### 1. HMAC embed token → cookie session

- Env var `DITTOFEED_EMBED_SECRET` (shared secret with Manager; read via the repo's config system — see how other env vars are declared in `packages/backend-lib/src/config.ts`).
- Token format: URL-safe base64 payload `{workspaceId, occupantId, exp}` + `.` + hex HMAC-SHA256 of the payload keyed by the secret. Verify signature AND `exp` (reject expired).
- `GET /embed/<component>?token=...` page route: middleware verifies the token; on success sets an HttpOnly, SameSite=Lax, Secure-when-not-localhost cookie `embed_session` holding the SAME signed token (1h TTL via exp), scoped `Path=/`; then serves the component page. Invalid/expired token → 401 page.
- **API auth extension**: in the API auth layer (study `packages/api/src/buildApp/` — `adminAuth.ts`, `requestContext.ts`, the `embeddedSession` / `ChildWorkspaceOccupant` seam already present in OSS), accept the `embed_session` cookie as an alternative authentication source on `/api/admin/*` routes: verify the same HMAC, resolve the request context to an occupant of the token's workspace with member-level access, scoped to that workspace ONLY. Existing single-tenant cookie auth must keep working unchanged. This lets the embedded pages' own XHRs (cookie-carrying) work with zero frontend fetch changes.
- Do NOT enable multi-tenant auth mode or touch its JWT path.

### 2. Chrome-free embed pages

- Under `packages/dashboard/src/pages/embed/` (Next.js pages dir — study how existing pages are structured/routed): five pages reusing the EXISTING components/tables from the main pages (templates, segments, journeys, broadcasts lists + their editor routes, deliveries table) but WITHOUT the dashboard's sidebar/nav/header chrome — a minimal layout. Follow how editors are deep-linked today (e.g. template editor route) so `embed/templates` lists and clicking opens the editor within the embed layout (either an embed editor route or an in-place transition — match existing routing patterns, smallest change).
- Respect `component-configurations` if trivially applicable; do not build new config UI.

## Acceptance criteria (literal)

- `grep -rn "DITTOFEED_EMBED_SECRET" packages/backend-lib/src/config.ts` finds the declared config.
- Embed middleware: valid token accepted; tampered payload rejected; expired token rejected; token for workspace A cannot access workspace B resources (context scoped by token workspaceId — assert in code/tests).
- Five `/embed/...` pages compile and render the existing components chrome-free.
- `yarn workspace {isomorphic-lib,backend-lib,api,dashboard} run check` all exit 0; no new eslint errors vs HEAD on touched files.
- Tests where infra allows (unit-testable pure functions: token sign/verify/expiry — no DB needed); skip container-dependent tests with a note.
- `git diff --stat` touches only: config, auth/requestContext/buildApp additions, new `pages/embed/` files, a minimal shared embed layout/component, and small glue imports in existing pages if strictly needed. No secret values.

## Do not

- Do not modify the Quo/folders logic beyond strictly-required type ripple.
- Do not implement Manager-side anything (different repo).
- Do not commit; leave changes in the working tree.
