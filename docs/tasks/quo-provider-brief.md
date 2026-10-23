# Brief: Quo (ex-OpenPhone) SMS provider in the DittoFeed fork

Work on branch `roompex/quo-provider` (already checked out). All changes must be ADDITIVE — no refactors of existing providers, no style churn, keep the patch separable for future upstream merges.

## Read BEFORE writing code, in this order

1. This brief.
2. `docs/tasks/references/quo-sms-provider.md` — verified Quo API surface + the file anatomy.
3. `docs/tasks/references/03-openphone-api-capabilities.md` — full research detail (payloads, webhook events, svix).
4. The existing Twilio implementation as the template to mirror:
   - `packages/isomorphic-lib/src/types.ts` (`SmsProviderType` union)
   - `packages/backend-lib/src/constants.ts` (secret-name map)
   - `packages/backend-lib/src/messaging.ts` and `packages/backend-lib/src/messaging/sms.ts` (dispatch)
   - `packages/backend-lib/src/destinations/twilio.ts` (destination module: send + status handling)
   - `packages/api/src/controllers/webhooksController.ts` (webhook routes; note it already uses svix for Resend)
   - Dashboard SMS-provider settings UI (grep for `SignalWire` in `packages/dashboard/src` to find every UI site)
   - Grep the whole repo for `SignalWire` — every hit is a site the new provider must be added to.

## Verified Quo API facts (do NOT re-derive; code to these)

- Base `https://api.quo.com`. Send: `POST /v1/messages` → 202, body `{content (≤1600), from (E.164 string), to (E.164 array, ≤10)}`.
- Auth: **raw API key in the `Authorization` header — NO `Bearer` prefix.**
- Webhooks (version 2026-03-30): events `message.received`, `message.delivered`, `message.failed`, `message.undelivered` (failed/undelivered carry `errorCode`). Svix-style HMAC signatures, secret prefix `whsec_`. There is NO per-message status callback URL — subscriptions are workspace-scoped.

## Deliverables

1. `SmsProviderType.Quo` added to the isomorphic-lib union + every exhaustive switch/site found by the `SignalWire` grep (backend dispatch, constants secret map, dashboard settings UI, anywhere else).
2. Provider config secrets (workspace-scoped, like Twilio): `Quo API Key`, `Quo From Number` (E.164), `Quo Webhook Secret` (`whsec_...`, for verifying inbound webhooks).
3. Destination module `packages/backend-lib/src/destinations/quo.ts` mirroring twilio.ts: send via POST /v1/messages with the raw-key Authorization header; on 202 response persist correlation (see 4) then record the send per existing patterns.
4. New Postgres table `QuoMessageCorrelation` (`messageId` PK from Quo's response, `workspaceId`, `userId`, `templateId` nullable) — add to the drizzle schema AND a migration file following the repo's existing migration conventions (look at how recent migrations are structured). Written in the send path; read by the webhook handler to resolve events.
5. Webhook route `POST /api/public/webhooks/quo` in webhooksController: verify svix HMAC over the RAW body (reuse the repo's existing svix usage for Resend), then map events to message status updates following how the Twilio status callback updates deliveries: delivered → delivered; failed/undelivered → failed (store `errorCode` if the schema allows, else include in any log/insert); `message.received` can be ignored for now.
6. Dashboard: Quo appears as an SMS provider option with the three secret fields above.

## Acceptance criteria (literal)

- `grep -rn "Quo" packages/isomorphic-lib/src/types.ts` shows the union member.
- `grep -rln "SignalWire" packages/ | wc -l` sites are each matched by a corresponding Quo addition (spot-check each file in the diff).
- Repo check commands pass on touched packages with NO new errors vs baseline: discover the commands from `AGENTS.md`/`CLAUDE.md`/root `package.json` scripts (typecheck/lint). Use yarn 4 via corepack (`corepack enable`). `yarn install` is expected to be slow — that's fine.
- If the repo has jest tests near the touched files, add a test for: (a) correlation row written on send, (b) svix signature verification accepts a valid signature and rejects an invalid one. If no test infra exists for these paths, say so in the completion message instead of inventing one.
- `git diff --stat` shows only: the listed files, new `destinations/quo.ts`, the migration, and schema additions. No secret values anywhere in the diff.

## Do not

- Do not touch Twilio/SignalWire logic beyond what adding a union member strictly requires (exhaustive switches).
- Do not commit; leave changes in the working tree.
- Do not modify docker/compose files.
