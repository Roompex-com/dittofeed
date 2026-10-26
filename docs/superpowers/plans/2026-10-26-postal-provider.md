# Postal Email Provider Implementation Plan

> **For agentic workers:** This plan is executed by opencode CLI (model zai/glm-5.3) in `~/projects/dittofeed`. Follow tasks in order. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **HARD RULES (user-gated repo):** Do NOT `git commit`, `git push`, or merge anything. Leave all changes uncommitted in the working tree. Do NOT touch files outside the list below. Follow existing code style exactly (prettier, double quotes, 2-space indent, `type` imports where the file uses them).

**Goal:** Add a native Postal email provider (HTTP API send + webhook status ingestion) to this DittoFeed fork so the Deliveries Status column shows Delivered/Bounced/Dropped/Opened/Clicked.

**Architecture:** New workspace-wide provider `Postal` sends via `POST /api/v1/send/message` and records per-recipient Postal message ids in a new Postgres table `postal_message_mappings`; a new webhook route `POST /webhooks/postal/:secret` receives Postal lifecycle events, resolves the mapping, and submits DittoFeed internal track events (`DFEmailDelivered` etc.) whose `properties.messageId` equals the original send's internal message id (the `origin_message_id` join key for the Deliveries table).

**Tech Stack:** TypeScript, typebox schemas, drizzle-orm (Postgres), fastify (API), jest, axios (already used in the codebase) or global fetch (Node 20 — the repo uses axios in messaging.ts; use axios for consistency).

**Spec:** `docs/superpowers/specs/2026-10-26-postal-provider-design.md` — read it first; this plan argues from it.

## Global Constraints

- Mirror existing provider patterns exactly: send client like `packages/backend-lib/src/destinations/sendgrid.ts` / `smtp.ts`; webhook handler like the Postmark/Resend handlers in the same directory; route registration like the `/sendgrid` route in `packages/api/src/controllers/webhooksController.ts`.
- Postal webhook envelope (current Postal): `POST` body `{ event: string, timestamp: number, payload: object, uuid: string }`. `payload.message` has `{ id, token, to, from, subject, ... }`; `MessageBounced` payloads use `payload.original_message` + `payload.bounce`; `MessageLoaded`/`MessageLinkClicked` have `ip_address`, `user_agent` (+ `url` for clicks).
- Every emitted status event MUST carry `properties.messageId` = original DittoFeed send `messageId` (from the mapping table) plus the other `MESSAGE_METADATA_FIELDS` present in the mapping row.
- No commits, no pushes.

---

### Task 1: Types and constants

**Files:**
- Modify: `packages/isomorphic-lib/src/types.ts`
- Modify: `packages/isomorphic-lib/src/constants.ts`

**Interfaces (Produces, used by later tasks):**
- `EmailProviderType.Postal = "Postal"` (string enum value)
- `PostalSecret = { type: "Postal", apiKey: string, baseUrl: string }`
- `EmailPostalSuccess = { type: "Postal", messageId?: string, postalMessageIds: number[] }` (variant of `MessageSendSuccessContents`)
- `MessagePostalFailure = { type: "Postal", message: string, status?: number }` (variant of `MessageSendFailure`)
- `SecretNames.Postal = "Postal"`

- [x] **Step 1: Add enum entries.** In `types.ts`, in the `EmailProviderType` const object (around line 136, alongside `Smtp: "Smtp"`), add `Postal: "Postal",`. In `WorkspaceWideEmailProviderType` (around line 152) add `Postal: EmailProviderType.Postal,`.
- [x] **Step 2: Add secret + success/failure schemas.** In `types.ts`: next to `SmtpSecret` (~line 4795) add:

```ts
export const PostalSecret = Type.Object({
  type: Type.Literal(EmailProviderType.Postal),
  apiKey: Type.String(),
  baseUrl: Type.String(),
});
export type PostalSecret = Static<typeof PostalSecret>;
```

Add `PostalSecret` to whatever union type `SmtpSecret` belongs to (find it, e.g. `EmailProviderSecret` union, and add there). Next to `EmailSmtpSuccess` (~line 4021) add:

```ts
export const EmailPostalSuccess = Type.Object({
  type: Type.Literal(EmailProviderType.Postal),
  messageId: Type.Optional(Type.String()),
  postalMessageIds: Type.Array(Type.Integer()),
});
export type EmailPostalSuccess = Static<typeof EmailPostalSuccess>;
```

and add it to the `MessageSendSuccessContents` union (the union at ~line 4053). Next to `MessageSmtpFailure` (~line 4327) add:

```ts
export const MessagePostalFailure = Type.Object({
  type: Type.Literal(EmailProviderType.Postal),
  message: Type.String(),
  status: Type.Optional(Type.Integer()),
});
export type MessagePostalFailure = Static<typeof MessagePostalFailure>;
```

and add it to the `MessageSendFailure` union (~line 4364).
- [x] **Step 3: Constants.** In `constants.ts`: add `Postal = "Postal"` to `SecretNames` enum; add `[EmailProviderType.Postal]: SecretNames.Postal,` to `EMAIL_PROVIDER_TYPE_TO_SECRET_NAME` (~line 50-62).
- [x] **Step 4: Typecheck.** Run from repo root: `yarn workspace isomorphic-lib typecheck` (if no typecheck script, run `yarn workspace backend-lib typecheck` or `npx tsc -p packages/isomorphic-lib --noEmit`). Expected: no NEW errors mentioning Postal. Existing unrelated errors are pre-existing — verify with `git stash && <typecheck> && git stash pop` if unsure.

---

### Task 2: Postal destination module (TDD)

**Files:**
- Create: `packages/backend-lib/src/destinations/postal.ts`
- Test: `packages/backend-lib/src/destinations/postal.test.ts`

**Interfaces:**
- Consumes: `PostalSecret`, `EmailProviderType`, `InternalEventType`, `MESSAGE_METADATA_FIELDS` (from `../constants`), `submitBatch` (from `../apps/batch`), `db()` + drizzle schema table `postalMessageMappings` (Task 3).
- Produces:
  - `sendMailPostal({ apiKey, baseUrl, to, cc, bcc, from, name, replyTo, subject, body, headers, attachments }): Promise<Result<PostalSendSuccess, PostalSendError>>` where `PostalSendSuccess = { messageId?: string, postalMessageIds: number[] }`, `PostalSendError = { message: string, status?: number }`
  - `submitPostalWebhookEvent({ body }): Promise<Result<null, Error>>` — webhook processing only (auth/signature is the route's job in Task 5)
  - `PostalWebhookBody` typebox schema for the envelope

- [x] **Step 1: Write failing tests** in `postal.test.ts`. Model the file on `packages/backend-lib/src/destinations/amazonses.test.ts` (read it first; copy its imports/mocking approach). Test cases (pure functions — export the mapping fn so it's testable without ClickHouse):
  1. `MessageSent` envelope → batch item with `event: "DFEmailDelivered"`, `properties.messageId` = origin id from mapping, `properties.email` = recipient.
  2. `MessageDeliveryFailed` → `DFEmailBounced` with `properties.bounceType === "hard"`.
  3. `MessageBounced` → `DFEmailBounced`, correlation id taken from `payload.original_message.id` (not `payload.message.id`).
  4. `MessageHeld` → `DFEmailDropped`; `MessageLoaded` → `DFEmailOpened` with `properties.ipAddress`; `MessageLinkClicked` → `DFEmailClicked` with `properties.url`.
  5. `MessageDelayed` and `DomainDNSError` → no batch item (skipped).
  6. Same envelope `uuid` produces the identical `messageId` (uuidv5 dedupe), different events produce different ids.
- [x] **Step 2: Run tests, verify they fail** (`yarn workspace backend-lib test src/destinations/postal.test.ts` or the repo's jest invocation — check `packages/backend-lib/package.json` scripts).
- [x] **Step 3: Implement `postal.ts`.** Core structure:

```ts
import axios from "axios";
import { Type } from "@sinclair/typebox";
import { Static } from "@sinclair/typebox";
import { Result, ok, err } from "neverthrow";
import { v5 as uuidv5 } from "uuid";
import { InternalEventType, EmailProviderType } from "../types";
import { MESSAGE_METADATA_FIELDS } from "../constants";
import { submitBatch } from "../apps/batch";
import { BatchItem, EventType } from "../types";
import { logger } from "../logger";
import { db } from "../db";
import * as schema from "../db/schema";
import { eq, inArray } from "drizzle-orm";

// --- Send API ---

export interface PostalSendSuccess { messageId?: string; postalMessageIds: number[]; }
export interface PostalSendError { message: string; status?: number; }

export async function sendMailPostal({ apiKey, baseUrl, to, cc, bcc, from, name, replyTo, subject, body, headers, attachments }: {
  apiKey: string; baseUrl: string; to: string; cc?: string[]; bcc?: string[];
  from: string; name?: string; replyTo?: string; subject: string; body: string;
  headers?: Record<string, string>;
  attachments?: { name: string; mimeType: string; data: string }[];
}): Promise<Result<PostalSendSuccess, PostalSendError>> {
  const fromField = name ? `${name} <${from}>` : from;
  try {
    const response = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/api/v1/send/message`,
      {
        to,
        ...(cc?.length ? { cc: cc.join(",") } : {}),
        ...(bcc?.length ? { bcc: bcc.join(",") } : {}),
        from: fromField,
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        html_body: body,
        ...(headers && Object.keys(headers).length ? { headers } : {}),
        ...(attachments?.length
          ? { attachments: attachments.map((a) => ({ name: a.name, content_type: a.mimeType, data: Buffer.from(a.data, "utf-8").toString("base64") })) }
          : {}),
      },
      { headers: { "X-Server-API-Key": apiKey }, timeout: 30_000 },
    );
    const data = response.data?.data;
    if (response.data?.status !== "success" || !data) {
      return err({ message: JSON.stringify(response.data), status: response.status });
    }
    // data.messages is per-recipient: either [{id, token, address}] or {address: {id, token}}
    const ids: number[] = [];
    if (Array.isArray(data.messages)) {
      for (const m of data.messages) if (typeof m?.id === "number") ids.push(m.id);
    } else if (data.messages && typeof data.messages === "object") {
      for (const key of Object.keys(data.messages)) {
        const m = (data.messages as Record<string, { id?: number }>)[key];
        if (typeof m?.id === "number") ids.push(m.id);
      }
    }
    return ok({ messageId: typeof data.message_id === "string" ? data.message_id : undefined, postalMessageIds: ids });
  } catch (e) {
    const axiosErr = e as { response?: { status?: number; data?: unknown }; message: string };
    return err({
      message: axiosErr.response ? JSON.stringify(axiosErr.response.data ?? axiosErr.message) : axiosErr.message,
      ...(axiosErr.response?.status ? { status: axiosErr.response.status } : {}),
    });
  }
}

// --- Webhooks ---

export const PostalWebhookEventName = Type.Union([
  Type.Literal("MessageSent"),
  Type.Literal("MessageDelayed"),
  Type.Literal("MessageDeliveryFailed"),
  Type.Literal("MessageHeld"),
  Type.Literal("MessageBounced"),
  Type.Literal("MessageLinkClicked"),
  Type.Literal("MessageLoaded"),
  Type.Literal("DomainDNSError"),
]);

const PostalWebhookMessage = Type.Object({
  id: Type.Integer(),
  to: Type.Optional(Type.String()),
});

export const PostalWebhookBody = Type.Object({
  event: PostalWebhookEventName,
  timestamp: Type.Number(),
  uuid: Type.Optional(Type.String()),
  payload: Type.Object({
    status: Type.Optional(Type.String()),
    details: Type.Optional(Type.String()),
    output: Type.Optional(Type.String()),
    ip_address: Type.Optional(Type.String()),
    user_agent: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    message: Type.Optional(PostalWebhookMessage),
    original_message: Type.Optional(PostalWebhookMessage),
  }),
});
export type PostalWebhookBody = Static<typeof PostalWebhookBody>;
```

Then the pure mapping function (exported for tests) `postalWebhookEventToBatchItem({ body, mapping }): Result<BatchItem | null, Error>` where `mapping` is the `postalMessageMappings` row, implementing exactly the event table from the spec (MessageDelayed/DomainDNSError → `ok(null)`), `messageId: uuidv5(`${body.event}:${body.uuid ?? postalMessageId}`, mapping.workspaceId)`, `timestamp: new Date(body.timestamp * 1000).toISOString()`, and `properties` containing `email` (from `payload.message.to ?? payload.original_message.to`), `bounceType` where applicable, `output`, `details`, `ipAddress`, `userAgent`, `url`, plus `R.pick(mapping, MESSAGE_METADATA_FIELDS)` filtered to non-null values (use the field names `workspaceId`, `userId`, `messageId`, `templateId`, `journeyId`, `nodeId`, `broadcastId`, `runId` — map from the snake_case columns; `properties.messageId` MUST be `mapping.messageId`).

Then `submitPostalWebhookEvent({ body })`: schema-validate the body (return err on failure), resolve `postalMessageId = payload.original_message?.id ?? payload.message?.id`, look up `db().query.postalMessageMappings.findFirst({ where: eq(schema.postalMessageMappings.postalMessageId, postalMessageId) })` — if missing, return `err` (route converts to 500 so Postal retries). Then call `postalWebhookEventToBatchItem`; on `ok(null)` return `ok(null)`; else `submitBatch({ workspaceId: mapping.workspaceId, data: [item] })` following the shape used in `packages/backend-lib/src/destinations/sendgrid.ts` `submitSendgridEvents`.

- [x] **Step 4: Run tests until green.**
- [x] **Step 5: Typecheck backend-lib.** No new errors.

---

### Task 3: Mapping table + migration

**Files:**
- Modify: `packages/backend-lib/src/db/schema.ts`
- Create: `packages/backend-lib/drizzle/0014_postal_message_mappings.sql` + `packages/backend-lib/drizzle/meta/` journal/snapshot entries

**Interfaces (Produces):** drizzle table `postalMessageMappings` with columns: `postalMessageId` (`bigint`/`integer` PK, mode number), `workspaceId` text, `userId` text, `messageId` text, `templateId` text nullable, `journeyId` text nullable, `nodeId` text nullable, `broadcastId` text nullable, `runId` text nullable, `createdAt` timestamp default now. Exported name `postalMessageMappings` so `db().query.postalMessageMappings` works.

- [x] **Step 1:** Read `schema.ts` and the latest table definition style; add the table following it exactly (they use pgTable with drizzle-orm pg-core).
- [x] **Step 2:** Generate the migration: try `cd packages/backend-lib && npx drizzle-kit generate` (drizzle config file — find `drizzle.config.ts` in the package; if the repo's flow differs, hand-write `0014_postal_message_mappings.sql` mirroring how `0013_user_property_audience.sql` is written and update `drizzle/meta/_journal.json` accordingly — read how 0013 did it).
- [x] **Step 3:** Verify migration SQL is idempotent (`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` style — match 0013's conventions).

---

### Task 4: Wire the provider into `sendEmail()`

**Files:**
- Modify: `packages/backend-lib/src/messaging.ts` (the `switch (emailProvider.type)` inside `sendEmail`, right after the `EmailProviderType.Smtp` case ending ~line 1160)

**Interfaces:**
- Consumes: `sendMailPostal` (Task 2), `postalMessageMappings` insert (Task 3), `PostalSecret` (Task 1).
- Produces: `MessageSent` success variant `{ provider: { type: EmailProviderType.Postal, messageId?, postalMessageIds } }` and mapping rows persisted before returning success.

- [x] **Step 1:** Add `case EmailProviderType.Postal:` mirroring the Smtp case structure: validate `emailProvider.apiKey` and `emailProvider.baseUrl` are present (else return `BadWorkspaceConfiguration` / `MessageServiceProviderMisconfigured` like the Smtp host check); call `sendMailPostal` passing `from`, `name: emailName`, `to`, `cc`, `bcc`, `subject`, `replyTo`, `body`, `headers` (the merged `customHeaders` + unsubscribe headers variable already built above the switch — same one the Smtp case uses), and `attachments` mapped like the Smtp case (`messageTags && attachments?.map(...)` guard).
- [x] **Step 2:** On error return `err({ type: InternalEventType.MessageFailure, variant: { type: ChannelType.Email, provider: { type: EmailProviderType.Postal, message: result.error.message, ...(status) } } })`.
- [x] **Step 3:** On success, BEFORE returning `ok(...)`, insert mapping rows (only when `messageTags` exists, mirroring the attachments guard):

```ts
if (messageTags && result.value.postalMessageIds.length) {
  await db()
    .insert(schema.postalMessageMappings)
    .values(
      result.value.postalMessageIds.map((postalMessageId) => ({
        postalMessageId,
        workspaceId,
        userId: messageTags.userId ?? userId,
        messageId: messageTags.messageId,
        templateId,
        journeyId: messageTags.journeyId ?? null,
        nodeId: messageTags.nodeId ?? null,
        broadcastId: messageTags.broadcastId ?? null,
        runId: messageTags.runId ?? null,
      })),
    )
    .onConflictDoNothing();
}
```

(Adjust snake/camel naming to the actual drizzle table def from Task 3. Check whether `schema` / `db` are already imported in messaging.ts — they are, as `db()` and schema aliases used elsewhere in the file.)

- [x] **Step 4:** Return the success object with `provider: { type: EmailProviderType.Postal, messageId: result.value.messageId, postalMessageIds: result.value.postalMessageIds }`.
- [x] **Step 5:** Also check `getEmailProvider`'s workspace-wide path validates against a union that includes the new `PostalSecret` (find `schemaValidateWithErr(... EmailProviderSecret ...)` around messaging.ts line 795) — `EmailProviderSecret` union update happens in Task 1; just confirm the Postal secret validates and no `assertUnreachable(providerOverride)` switch needs a new case (workspace-wide providers go through the generic path; only non-workspace-wide like Gmail have the switch).
- [x] **Step 6:** Typecheck + run existing backend-lib tests touching messaging (`yarn workspace backend-lib test src/messaging` if such a script/file exists; otherwise full typecheck only).

---

### Task 5: Webhook route

**Files:**
- Modify: `packages/api/src/controllers/webhooksController.ts`

**Interfaces:**
- Consumes: `submitPostalWebhookEvent`, `PostalWebhookBody` (Task 2).
- Produces: `POST /webhooks/postal/:secret` returning `{ status: "ok" }` (200), 401 on secret mismatch, 400 on invalid payload, 500 on unmapped postal message id (so Postal retries).

- [x] **Step 1:** Register `fastifyRawBody` on the route (the controller already registers it globally — verify; the SendGrid route reads `request.rawBody`). Route skeleton mirroring the `/sendgrid` route (~line 76):

```ts
fastify.withTypeProvider<TypeBoxTypeProvider>().post(
  "/postal/:secret",
  {
    schema: {
      description: "Used to consume Postal webhook payloads.",
      tags: ["Webhooks"],
      body: PostalWebhookBody,
    },
  },
  async (request, reply) => {
    const { secret } = request.params as { secret: string };
    const expected = process.env.POSTAL_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      return reply.status(401).send({ message: "Unauthorized" });
    }
    // Optional RSA-SHA256 signature verification when a public key is configured
    const pubKey = process.env.POSTAL_WEBHOOK_PUBLIC_KEY;
    if (pubKey) {
      const signature = request.headers["x-postal-signature-256"];
      const verified =
        typeof signature === "string" &&
        crypto.verify(
          "SHA256",
          Buffer.from(request.rawBody ?? JSON.stringify(request.body)),
          pubKey,
          Buffer.from(signature, "base64"),
        );
      if (!verified) {
        return reply.status(401).send({ message: "Invalid signature" });
      }
    }
    const result = await submitPostalWebhookEvent({ body: request.body });
    if (result.isErr()) {
      logger().info({ err: result.error }, "Error handling postal webhook.");
      if (/not found/i.test(result.error.message)) {
        return reply.status(500).send({ message: result.error.message });
      }
      return reply.status(400).send({ message: result.error.message });
    }
    return reply.status(200).send({ status: "ok" });
  },
);
```

Import `node:crypto`'s `verify` as shown (or `createPublicKey`/`createVerify` — use whichever pattern compiles cleanly with a raw PEM string env var). Match the file's existing import style. Ensure the openapi schema accepts the extra `uuid` field (typebox object is non-strict by default — additionalProperties allowed — fine).
- [x] **Step 2:** Typecheck `packages/api` (`yarn workspace api typecheck` or root typecheck).

---

### Task 6: Dashboard settings

**Files:**
- Modify: `packages/dashboard/src/pages/settings.page.tsx`

**Interfaces:**
- Consumes: `EmailProviderType.Postal` (Task 1); existing secret-save flows for SMTP (find the SMTP section in the file and mirror it).
- Produces: a "Postal" email provider section with Base URL + API Key fields and a save action following the SMTP section's state/submit pattern; "Postal" appears in the default email provider dropdown.

- [x] **Step 1:** Read the SMTP section thoroughly; duplicate its block for Postal with two fields (`baseUrl`, `apiKey`). Reuse the same store hooks / `updateWorkspaceSecret`-style calls the SMTP block uses. Postal secret payload: `{ type: "Postal", apiKey, baseUrl }`.
- [x] **Step 2:** Add `Postal` to the default email provider select options (wherever `EmailProviderType.Smtp` appears as an option in that file).
- [x] **Step 3:** Build/typecheck the dashboard: `yarn workspace dashboard typecheck` (or `npx tsc -p packages/dashboard --noEmit`).

---

### Task 7: Final verification

- [x] **Step 1:** Full typecheck of touched workspaces: isomorphic-lib, backend-lib, api, dashboard.
- [x] **Step 2:** Run new tests: `postal.test.ts` green.
- [x] **Step 3:** Run the repo's existing backend-lib test suite if it normally passes on this branch (check git status is otherwise clean first). Report any failures — do not fix unrelated pre-existing failures.
- [x] **Step 4:** `git status` — confirm ONLY the files listed in this plan are modified. Present `git diff --stat` in the final report. Do NOT commit.
