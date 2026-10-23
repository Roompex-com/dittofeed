# Research 03 — OpenPhone (now "Quo") API capabilities & fit as a DittoFeed SMS provider

Date: 2026-10-22 · Status: complete · Sources: live docs + DittoFeed OSS repo (main branch)

## ⚠️ Critical context: OpenPhone rebranded to **Quo**

- **`developers.openphone.com` and `docs.openphone.ai` are dead** (DNS no longer resolves; `www.openphone.com` 301-redirects to `www.quo.com`). Company is now "Quo (formerly OpenPhone)"; legal entity still "OpenPhone Technologies, Inc."
- Current developer docs: **https://www.quo.com/docs** (Mintlify; full index at `https://www.quo.com/docs/llms.txt`, pages also served as `.md`)
- **API base URL: `https://api.quo.com`** (old `api.openphone.ai` also dead)
- API has two generations: legacy **v1** (`/v1/...`) and a new dated version **`2026-03-30`** (enabled via `Quo-Api-Version` header). Message sending is still on v1 (`POST /v1/messages`); webhooks have a new unified system on the dated version.

## 1. Send-SMS endpoint

- **`POST https://api.quo.com/v1/messages`** → `202 Accepted` (async)
- **Auth: `Authorization: <api-key>` header — the raw API key, NOT a Bearer token.** Keys are generated in Quo workspace Settings → API tab (owner/admin only); each key has full account access.
- Payload (JSON):

| Field | Type | Notes |
|---|---|---|
| `content` | string, req | 1–1600 chars, must contain non-whitespace |
| `from` | string, req | E.164 (`+15555555555`) **or** Quo phone-number ID (`PN…`); (`phoneNumberId` is the deprecated equivalent) |
| `to` | string[], req | E.164 array, 1–10 recipients (10 = group message) |
| `userId` | string, opt | `US…` user attributed as sender; must be member of the `from` number; defaults to number owner |
| `setInboxStatus` | enum, opt | `"done"` to auto-resolve the inbox conversation |

- Response: `{ data: { id: "AC…", to, from, text, phoneNumberId: "PN…", conversationId: "CN…", direction, userId, status, createdAt, updatedAt, media[] } }`
- Response `status` enum: `queued | sent | delivered | undelivered | received` (full webhook status set is broader: + `sending, failed, receiving, accepted, scheduled, read, partially_delivered, canceled`)

### Phone number / registration requirements
- Active Quo **subscription** required for API access; API key needs workspace **owner/admin**.
- **US A2P carrier registration required** to text US numbers via API — otherwise `400 A2P Registration Not Approved` (code `0206400`). This is a per-business registration/campaign approval process (days, not minutes) — Roompex must complete it before go-live.
- `from` must be a Quo number owned by the workspace (`GET /v1/phone-numbers` lists them); sender user must be a member of that number.
- International sending can be blocked: `403 International Messaging Not Allowed` (`0203403`) depending on number/plan settings.
- **Prepaid API credits required** (US/CA: $0.01/segment; international: $0.01 + country rate). Messages **fail** if credits are insufficient. Segment rules standard GSM-7 160 / Unicode 70.
- **MMS is not supported via the API** (SMS text only).
- Call routing: irrelevant for SMS sending; Quo handles calls itself (call flow builder / IVR). Webhooks can be filtered per phone number (`resourceIds: ["PN…"]`).

## 2. Rate limits

- **10 requests/second per API key** (docs page; older demo video said per workspace) → `429` with `RATE_LIMIT_EXCEEDED` on burst; support can raise it (`support+developers@quo.com`).
- **Org-level daily outbound conversation limit** → `429` code `0200429 "Daily Conversation Limit Reached"` (separate from the per-second limit; tied to plan/A2P).
- **A2P daily message cap** → `403` code `0200403`.
- Assessment for DittoFeed: 10 rps is ample (DittoFeed sends via queued workers; add 429 backoff/retry).

## 3. Webhooks

### Legacy v1 (still functional): `POST /v1/webhooks/messages`
- Request: `{ url, events: ["message.received", "message.delivered"], resourceIds?: ["PN…"|"*"], label?, status? }`
- **Only 2 message event types: `message.received` and `message.delivered`** — no failed/undelivered on v1.
- Payload shape: `data.object.…`; signature header `OpenPhone-Signature`.

### New webhooks (API version `2026-03-30`): `POST https://api.quo.com/webhooks` with `Quo-Api-Version: 2026-03-30`
- Unified subscription: `{ url, events: [...], resourceIds?, status? }`; version pinned at creation; max **50 webhooks/workspace**.
- **Envelope**: `{ id, apiVersion, createdAt, type, data: { resource, context: { orgId, phoneNumberId, conversationId, userId, contacts, senderIdentifier, recipientIdentifiers }, links } }`
- **Message event types (delivery status callbacks):**
  - `message.received` — inbound SMS (body text, media, `senderIdentifier` = caller E.164)
  - `message.delivered` — delivery confirmation (explicitly *not* a read receipt)
  - `message.failed` — send failure, retryable; `resource.errorCode` = carrier error code (Twilio-style codes, e.g. `30006`) or null
  - `message.undelivered` — terminal, cannot be retried
  - (Also call.* events: ringing/answered/completed/forwarded/missed/menu.selected/recording/summary/transcript/voicemail; contact.updated/deleted; a large task.* family.)
- **Signature**: headers `webhook-id`, `webhook-timestamp`, `webhook-signature` = HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw-body}`; secret `whsec_…`; **verified by the standard `svix` library**.
- **Delivery semantics**: auto-retry on non-2xx, 8 attempts over ~27.5h (1s, 5s, 5m, 30m, 2h, 5h, 10h, 10h); ordering NOT guaranteed; dedupe via `webhook-id` header; manual retry + delivery-history API (`GET /webhooks/:id/events`, `POST /webhooks/:id/events/:deliveryId/retry`); **`POST /webhooks/:id/events/test` sends signed sample payloads** for any event type — very handy for local dev.
- **No per-message `statusCallback` parameter** — unlike Twilio, you cannot attach a callback URL + custom query params to an individual send. Webhook subscriptions are workspace/number-scoped and must be created out-of-band (dashboard or API call).

## 4. WhatsApp via OpenPhone

**Not available.** OpenPhone/Quo has no WhatsApp integration — official position (OpenPhone team on r/openphone): WhatsApp "doesn't allow VoIP providers." The API is SMS-only (no MMS, no WhatsApp). Third-party iPaaS bridges (Albato, Workload) merely connect OpenPhone *triggers* to the separate **WhatsApp Business API (Meta)**. If WhatsApp is ever on Roompex's roadmap it needs its own provider (Meta Cloud API or Twilio) — OpenPhone contributes nothing there.

## 5. DittoFeed OSS Twilio/SignalWire provider anatomy (verified from `dittofeed/dittofeed` @ main)

Files & flow:

1. **`packages/isomorphic-lib/src/types.ts`** — `enum SmsProviderType { Twilio, SignalWire, Test }`; per-provider secret TypeBox schemas (`TwilioSecret`: accountSid, authToken *or* apiKeySid+apiKeySecret, messagingServiceSid; `SignalWireSecret`: project, token, spaceUrl, phone); `SmsProviderSecret` union; sender-override types (`TwilioSenderOverrideType.PhoneNumber | MessageSid`); Twilio inbound webhook schemas (`TwilioInboundSchema`, `TwilioMessageStatus`).
2. **`packages/isomorphic-lib/src/constants.ts`** — `SecretNames` enum + `SMS_PROVIDER_TYPE_TO_SECRET_NAME` map (type → secret row name in the `secret` table).
3. **`packages/backend-lib/src/messaging/sms.ts`** — `upsertSmsProvider` / `getOrCreateSmsProviders`: stores config in the `secret` table, row in `smsProvider` table, `defaultSmsProvider` pointer; switch over provider type.
4. **`packages/backend-lib/src/messaging.ts` → `sendSms()`** — the dispatcher: loads provider+secret from DB, validates config, renders Liquid body, resolves recipient from the SMS user identifier, then `switch (smsProvider.type)`; Twilio branch builds `TwilioAuth` + `Sender` (messagingServiceSid or from-number, per-send sender overrides supported) and calls the destination module. Errors map to `InternalEventType.MessageFailure` / `BadWorkspaceConfiguration`.
5. **`packages/backend-lib/src/destinations/twilio.ts`** — `sendSms()` calls `client.messages.create({ body, to, from|messagingServiceSid, statusCallback })` where **`statusCallback = {dashboardUrl}/api/public/webhooks/twilio?workspaceId=…&userId=…&subscriptionGroupId=…&tags`** (per-message correlation via query params!), returns `{ sid }`. `submitTwilioEvents()` maps webhook `SmsStatus` → internal events: `Failed` → `SmsFailed`, `Delivered` → `SmsDelivered`, submitted as Track events via `submitBatch`.
6. **`packages/api/src/controllers/webhooksController.ts`** — `POST /twilio` route: validates `x-twilio-signature` using the stored `authToken` (Twilio `validateRequest`), checks workspace eligibility, calls `submitTwilioEvents`. Note the controller **already imports and uses `svix`** for Resend webhooks.
7. Dashboard UI: `channelProviderAutocomplete.tsx` + `secretEditor.tsx` (config is secret-driven, so UI work is minimal); docs page `packages/docs/integrations/channels/twilio.mdx`.

## 6. Assessment: fork-added OpenPhone provider vs n8n bridge

### Option A — fork-added native provider (recommended)
Effort: **~2–4 dev-days**, additive, low merge-conflict surface. Touchpoints:

| Step | File(s) | Work |
|---|---|---|
| 1 | `isomorphic-lib/src/types.ts` | `SmsProviderType.OpenPhone`, `OpenPhoneSecret { apiKey, from }`, sender-override type |
| 2 | `isomorphic-lib/src/constants.ts` | `SecretNames.OpenPhone = "openphone"` + map entry |
| 3 | `backend-lib/src/messaging/sms.ts` | one case in two switches |
| 4 | **new** `backend-lib/src/destinations/openphone.ts` | `sendSms()` = one HTTPS POST to `api.quo.com/v1/messages` (`Authorization: apiKey`, `{ content, from, to: [to] }`); simpler than Twilio (single key, no SID juggling) |
| 5 | `backend-lib/src/messaging.ts` | one `case SmsProviderType.OpenPhone` (smallest of the three) |
| 6 | `webhooksController.ts` | `POST /openphone` route; verify `webhook-signature` with **svix (already a dependency)** against the webhook's `whsec_` secret; map `message.delivered/failed/undelivered` → `SmsDelivered`/`SmsFailed` Track events |
| 7 | dashboard `secretEditor`/provider forms + docs page | trivial |

**The one real design problem — webhook correlation.** Twilio lets DittoFeed pass `workspaceId`/`userId`/tags as `statusCallback` query params per message. OpenPhone has **no per-message callback**: webhooks are workspace-scoped subscriptions and the payload only carries Quo's own ids (`resource.id = AC…`, `context.phoneNumberId`). Options:
- Persist `messageId → (workspaceId, userId, tags)` at send time (small table or reuse existing store), look up on webhook; **or**
- Resolve workspace by the `from` phone number (`context.phoneNumberId`/`senderIdentifier` → workspace provider secret), and accept delivery events without per-user tags (map into Track events keyed by recipient phone → user). Since self-hosted = typically one workspace per deployment, this degenerates to a constant.

Setup step (one-time, documented like Twilio's docs page or a bootstrap script): create the Quo webhook subscription pointing at `{publicUrl}/api/public/webhooks/openphone` — either manually in the Quo dashboard or via `POST /webhooks` (`Quo-Api-Version: 2026-03-30`) with `events: ["message.delivered","message.failed","message.undelivered"]` (+ `message.received` if inbound-reply journeys are wanted — note OSS currently has no inbound-SMS internal event; Twilio path effectively handles status only).

Use the **new (2026-03-30) webhooks, not v1** — v1 lacks `failed`/`undelivered` and uses the legacy `OpenPhone-Signature`; the new ones are svix-verified (lib already in DittoFeed), have delivery history, test-event injection (great for CI), and 27.5h retries.

Maintenance cost of the fork: the touchpoints are small, additive enums/switch-cases/new-file — upstream rebases should stay clean. Rate limit (10 rps) needs only 429 backoff.

### Option B — n8n bridge (DittoFeed Webhook channel → n8n → OpenPhone)
- Faster to stand up (~a day), zero fork maintenance.
- But: DittoFeed's **Webhook channel is not the SMS channel** — SMS templates, SMS subscription groups, `ChannelType.Sms` journeys, and per-user phone identifiers don't apply; you'd template the phone number/body into a generic webhook payload per user (awkward at batch scale — the webhook channel sends one HTTP request per message, which n8n then relays, so n8n becomes a runtime dependency *and* a throughput bottleneck at the same 10 rps Quo limit, minus orchestration).
- **Delivery status never flows back** into DittoFeed (no `SmsDelivered`/`SmsFailed` events) unless you also build the reverse n8n → DittoFeed ingest call — at which point you've rebuilt half the provider inside n8n with worse observability.
- Quo webhook signature verification, retries, and dedupe all land on n8n workflow code.

### Verdict
**Fork-added provider.** OpenPhone/Quo's surface is *simpler* than Twilio's (one API key, one POST), webhooks map cleanly onto the existing `submitTwilioEvents` pattern (statuses delivered/failed/undelivered vs Twilio's delivered/failed), svix is already in the stack, and the only novel work is the webhook→workspace/user correlation plus a one-time subscription-setup step. The n8n bridge forfeits SMS-channel semantics and delivery status for marginal setup savings. Budget extra calendar time (not dev time) for **US A2P carrier registration** and **prepaid credit setup** — those gate go-live regardless of option.

## Source index
- Quo docs: `/docs/mdx/api-reference/{introduction,authentication,rate-limits,messages/send-a-text-message,webhooks/create-a-new-webhook-for-messages}.md`, `/docs/mdx/pricing-support/pricing-overview.md`, `/docs/2026-03-30/{webhooks-overview,webhooks-event-payloads,webhooks-migration-guide}.md`, `/docs/llms.txt`, `/docs/changelog`
- Quo API marketing/FAQ: quo.com/api (MMS not supported, credit pricing)
- Reddit r/openphone (official: no WhatsApp), YouTube API demo (10 rps, 429, carrier registration)
- DittoFeed OSS: `packages/backend-lib/src/{destinations/twilio.ts, messaging.ts, messaging/sms.ts}`, `packages/api/src/controllers/webhooksController.ts`, `packages/isomorphic-lib/src/{types.ts, constants.ts}` @ main
