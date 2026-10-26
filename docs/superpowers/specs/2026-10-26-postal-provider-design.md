# Native Postal Email Provider for DittoFeed — Design

Date: 2026-10-26 · Status: Approved by user (2026-10-26) · Repo: `~/projects/dittofeed` (fork, never merges upstream)

## Goal

Make DittoFeed's Deliveries Status column show real delivery states (Delivered / Bounced / Dropped / Opened / Clicked) by sending email through **Postal's HTTP API** (self-hosted on Contabo1) and consuming **Postal webhooks**, instead of the current SMTP connection which can only ever show "Sent".

## Why status is stuck on "Sent" (verified in this fork)

- DittoFeed emits status events (`DFEmailDelivered`, `DFEmailBounced`, `DFEmailOpened`, `DFEmailClicked`, `DFEmailDropped`, `DFEmailMarkedSpam`) **only** from built-in provider webhook handlers (`packages/api/src/controllers/webhooksController.ts` — routes `/sendgrid`, `/amazon-ses`, `/resend`, `/postmark`, `/mailchimp`, `/twilio`, `/segment`). No generic endpoint, no Postal provider.
- The Deliveries query joins status events to the original `DFInternalMessageSent` event via `origin_message_id`, which the ClickHouse materialized view extracts as `JSONExtractString(properties, 'messageId')`. **A status event only updates the Status column if its `properties.messageId` equals the DittoFeed internal `messageId` of the original send.** This is the core correlation requirement.
- At send time, `sendEmail()` in `packages/backend-lib/src/messaging.ts` has `messageTags` = `{ messageId, workspaceId, userId, templateId, + journey/broadcast tags }` — everything needed for correlation (this is exactly what SendGrid round-trips via `customArgs`).

## Architecture

```
DittoFeed worker/api                        Postal (Contabo1)
  sendEmail()                                ┌─────────────────────────────┐
    └─ POST /api/v1/send/message ───────────►│ accept message              │
       (X-Server-API-Key, per-recipient      │  per-recipient {id, token}  │
        ids returned in response)            └──────────┬──────────────────┘
    └─ INSERT postal_message_mappings                   │ lifecycle events
       (postal id → metadata)                           ▼
                                            POST /webhooks/postal/<secret>
  webhooksController: verify secret ───────►  {event, timestamp, payload, uuid}
    lookup postal_message_mappings
    submitBatch(track DFEmail* event
      with properties.messageId = origin)
```

### Component decisions

1. **New email provider `Postal`** (workspace-wide, like SMTP):
   - Secret: `SecretNames.Postal = "Postal"` with config `{ type: "Postal", apiKey: string, baseUrl: string }` (e.g. `baseUrl = https://mail.roompex.com`).
   - Send via `POST {baseUrl}/api/v1/send/message`, header `X-Server-API-Key: <apiKey>`. Body params (verified from Postal source `app/controllers/legacy_api/send_controller.rb`): `to` (comma-joined string), `cc`, `bcc` (comma-joined), `from` (with display name via `"Name <addr>"` when set), `sender`, `reply_to`, `subject`, `html_body`, `plain_body`, `headers` (object), `tag`, `attachments: [{name, content_type, data: base64}]`.
   - Success response: `{ status: "success", data: { message_id, messages: [{id, token, address} | {address: {id, token}}] } }` — per-recipient numeric `id`s.
   - SMTP provider stays untouched; workspace default switches to Postal at rollout.

2. **Correlation via Postgres mapping table** (chosen over `tag`+ClickHouse lookup):
   - Table `postal_message_mappings`: `postal_message_id` (bigint PK), `workspace_id`, `user_id`, `message_id` (the DittoFeed internal origin id), `template_id`, `journey_id`, `node_id`, `broadcast_id`, `run_id` (all nullable text), `created_at`.
   - Written immediately after a successful send (one row per recipient id from the response).
   - Race handling: if a webhook arrives before the row exists, the endpoint returns 500; Postal retries non-2xx webhooks 5 times (2/3/6/10/15 min backoff — verified in `app/services/webhook_delivery_service.rb`), which covers the sub-second race.

3. **Webhook endpoint** `POST /webhooks/postal/:secret` in `webhooksController.ts`:
   - Auth: `:secret` must equal `process.env.POSTAL_WEBHOOK_SECRET` (long random token; private Contabo1→Contabo2 network). Optional hardening (implement, env-gated): if `POSTAL_WEBHOOK_PUBLIC_KEY` (PEM) is set, verify `X-Postal-Signature-256` (RSA-SHA256 over raw body, base64) and reject on mismatch.
   - Payload envelope (verified from Postal source `WebhookDeliveryService#generate_payload`): `{ event, timestamp, payload, uuid }`. Legacy flat payloads (no envelope) are rejected with a logged 400 — our Postal install is current.
   - Event mapping:

     | Postal event | DittoFeed internal event | properties extras |
     |---|---|---|
     | `MessageSent` | `DFEmailDelivered` | `output`, `details` |
     | `MessageDeliveryFailed` | `DFEmailBounced` | `bounceType: "hard"`, `output`, `details` |
     | `MessageBounced` | `DFEmailBounced` | `bounceType: "bounce"`, bounce `output`/`details`; correlation via `payload.original_message.id` |
     | `MessageHeld` | `DFEmailDropped` | `output`, `details` |
     | `MessageLoaded` | `DFEmailOpened` | `ipAddress`, `userAgent` |
     | `MessageLinkClicked` | `DFEmailClicked` | `ipAddress`, `userAgent`, `url` |
     | `MessageDelayed` | *(ignored — no DittoFeed status)* | — |
     | `DomainDNSError` | *(ignored)* | — |

   - Emitted events follow the SendGrid handler shape: `submitBatch` items `{ type: "track", event: InternalEventType.*, userId, messageId: uuidv5(\`${event}:${payload.uuid ?? postalMessageId}\`, workspaceId), timestamp, properties: { email, ...MESSAGE_METADATA_FIELDS, messageId: <origin id> } }`. The stable uuidv5 message id dedupes Postal retries; `properties.messageId` is the origin join key.

4. **Dashboard settings** (`packages/dashboard/src/pages/settings.page.tsx`): mirror the SMTP section — Postal fields (Base URL, API key) + add Postal to the default-email-provider select.

## Files touched

| File | Change |
|---|---|
| `packages/isomorphic-lib/src/types.ts` | `EmailProviderType.Postal`, `WorkspaceWideEmailProviderType`, `PostalSecret`, `EmailPostalSuccess`, `MessagePostalFailure` (+ union members) |
| `packages/isomorphic-lib/src/constants.ts` | `SecretNames.Postal`, `EMAIL_PROVIDER_TYPE_TO_SECRET_NAME` entry |
| `packages/backend-lib/src/destinations/postal.ts` | NEW — `sendMailPostal`, Postal webhook payload schemas, `postalWebhookEventToBatchItem`, mapping-table helpers |
| `packages/backend-lib/src/destinations/postal.test.ts` | NEW — unit tests |
| `packages/backend-lib/src/db/schema.ts` | `postalMessageMappings` table |
| `packages/backend-lib/drizzle/0014_postal_message_mappings.sql` + meta | migration (follows 0013 pattern; generated via drizzle-kit or hand-written to match) |
| `packages/backend-lib/src/messaging.ts` | `case EmailProviderType.Postal` in `sendEmail()` (+ insert mapping rows on success) |
| `packages/api/src/controllers/webhooksController.ts` | `POST /webhooks/postal/:secret` route |
| `packages/dashboard/src/pages/settings.page.tsx` | Postal settings section + provider option |

## Out of scope

- Postal admin config (webhook endpoint creation, enabling "track messages"/"track links") — done by user during rollout, with walkthrough.
- Any Manager app UI — tracking results display in DittoFeed's own Deliveries table (embedded in Manager already).
- Upstream PR — this fork never merges upstream.

## Rollout checklist (post-implementation, user-gated)

1. Set `POSTAL_WEBHOOK_SECRET` (and optionally `POSTAL_WEBHOOK_PUBLIC_KEY`) in DittoFeed api deployment env.
2. Run migration 0014.
3. Dashboard settings: enter Postal baseUrl + API key, set default provider = Postal.
4. Postal admin (Contabo1): create webhook `https://<dittofeed-api>/webhooks/postal/<secret>` with events MessageSent, MessageDeliveryFailed, MessageBounced, MessageHeld, MessageLoaded, MessageLinkClicked; enable track messages + track links on the mail server.
5. Send a test broadcast to a seed address; verify Deliveries shows Delivered, then Opened/Clicked.
