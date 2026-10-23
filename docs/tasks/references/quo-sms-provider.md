# Quo (ex-OpenPhone) SMS — API surface + fork provider anatomy

## Account state
- OpenPhone rebranded to **Quo**. Old developer domains (developers.openphone.com, docs.openphone.ai, api.openphone.ai) are dead; docs at `quo.com/docs`, API base `https://api.quo.com`.
- The user already sends production SMS via Quo from an active n8n workflow (`GET /v1/phone-numbers`, `POST /v1/messages`, header-auth credential) — US A2P registration and prepaid credits are already satisfied on the account. Reuse the existing API key rather than provisioning a new one.

## API surface
- Send: `POST /v1/messages` → 202. Auth = **raw API key in the `Authorization` header (no Bearer prefix)**. Payload: `{content (≤1600), from (E.164 or number id), to (E.164 array ≤10), userId?, setInboxStatus?}`. No MMS via API.
- Gates: active subscription, US A2P carrier registration (else 400), prepaid credits ($0.01/segment US/CA), `from` must be a workspace number.
- Rate limits: 10 req/s per API key (429 on burst), org-level daily conversation limit (429), A2P daily cap (403).
- Webhooks: legacy v1 has `message.received`/`message.delivered`; the dated `2026-03-30` webhook version adds `message.failed`/`message.undelivered` (carrier errorCode). Svix-style HMAC signatures (`whsec_` secret, svix lib), 8 retries over ~27.5h. **No per-message statusCallback param** — subscriptions are workspace-scoped, so correlate webhook → DittoFeed user by persisting messageId→user at send time (or resolve by from-number; trivial for a single-instance self-host). Prefer the 2026-03-30 webhook version for failed/undelivered tracking.
- **No WhatsApp** — WhatsApp bars VoIP providers; a WhatsApp channel needs a separate Meta/Twilio provider.

## Fork provider anatomy (files to touch, mirroring Twilio/SignalWire)
1. Provider enum: `isomorphic-lib/types.ts`.
2. Secret-name map: `constants.ts`.
3. Dispatch switches: `backend-lib/messaging.ts` and `backend-lib/messaging/sms.ts`.
4. Destination module: `backend-lib/src/destinations/twilio.ts` is the template (send + status callback handling).
5. Webhook route: `webhooksController.ts` (already uses svix for Resend — reuse for Quo).

Estimated ~2–4 dev-days; Quo's surface is simpler than Twilio's (one key, one POST). Keep the patch additive for merge-friendliness.
