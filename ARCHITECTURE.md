# Architecture — nbos-whatsapp-gateway

## What this Gateway is

A standalone HTTP service that lets external systems (e.g. NBOS) send WhatsApp messages with a single, simple JSON call. It owns the WhatsApp accounts, the WAHA sessions, and the API tokens. It exposes a tiny operations dashboard.

## What this Gateway is NOT

- Not a Messenger UI.
- Not part of NBOS, not a plugin, not a tenant of NBOS.
- Does not show chats, groups, conversations, messages, webhook events, or raw payloads anywhere.
- Does not store outbound message text.
- Does not normalize phone numbers, does not build chatId from phone.
- Does not modify message text (no name prefix, no signature, no formatting changes).

## Final business rules

1. Exactly one human `Admin` can sign in to the dashboard.
2. A `Project` is an external application (NBOS, Reminder Service, OMMM, CRM X). Projects never log in.
3. One `Project` may own many `ApiToken`s and many `WhatsappAccount`s.
4. An `ApiToken` is bound to a `Project`. `/api/v1` uses the token only to identify the Project; callers pass `accountId`. Legacy unversioned send/group APIs still resolve exactly one active account on that project, or fail closed.
5. External systems pass only `chatId` and `text` (or media URL). Gateway sends `text` exactly as received.

## Top-level architecture

```
External system / NBOS
   │  POST /api/v1/accounts/:accountId/messages   (Bearer <PROJECT_TOKEN>, Idempotency-Key)
   │  POST /api/messages/send                     (legacy: Bearer → exactly one active account)
   ▼
WhatsApp Gateway  (NestJS, Prisma, Neon Postgres)
   │  Project token → accountId + projectId ownership → WhatsappAccount.sessionName
   │  internal HTTP
   ▼
WAHA  (devlikeapro/waha:noweb-2026.8.1, Docker, not published)
   │  WhatsApp protocol
   ▼
WhatsApp recipient / group
```

Public ingress: only the Gateway (`https://wa-gateway.example.com`).
WAHA is reachable only on the internal Docker network (`http://waha:3000`).

Persistence: Neon Postgres via Prisma.
WAHA session storage: persistent Docker volume mounted at `/app/.sessions`.

## Modules and boundaries

| Module               | Responsibility                                                                                  |
|----------------------|-------------------------------------------------------------------------------------------------|
| `config`             | Env validation (class-validator). Fail-fast on missing/invalid env.                             |
| `common`             | Global exception filter, response envelope, request-id, guards, decorators, redacting logger.   |
| `prisma`             | `PrismaService` and `PrismaModule`. Single DB client.                                           |
| `auth`               | Dashboard Admin login/logout. Argon2id. JWT in httpOnly cookie. CSRF. Session revalidated from DB. |
| `projects`           | Admin CRUD over projects (name/slug/active). No project login.                                      |
| `whatsapp-accounts`  | Accounts belong to a Project. Status, restart/stop/unlink, QR / pairing code. Mode is stored (`SEND_ONLY` / `MESSENGER`). |
| `api-tokens`         | Tokens belong to a Project. HMAC-SHA256 with `TOKEN_PEPPER`. Show-once via signed cookie.          |
| `waha`               | Isolated WAHA boundary. Only place that knows WAHA URL shape and status strings.                |
| `messages`           | Legacy `POST /api/messages/send` (+ media). ApiToken guard. Strict DTO. Outbound log lifecycle.          |
| `v1`                 | Project-token `/api/v1/accounts` list/status/QR/pairing-code/session/send. Account-scoped. Durable idempotency. No Messenger.   |
| `groups`             | Group lifecycle API: list/create/get/refresh/participants/invite-link. Idempotent mutations.     |
| `health`             | `GET /health` returning `{ gateway, database, waha }`.                                          |
| `dashboard`          | Handlebars Admin pages: Dashboard, Projects, System/Health. QR poll JSON.                       |

Strict rule: WAHA-specific URLs, headers, and status strings live only inside `src/waha/*`. Other modules consume `WahaService` only.

## Data model

```
Admin (singleton)
Project (1) ──── (n) ApiToken
        └── (n) WhatsappAccount
                    ├── (n) OutboundMessageLog          [no text, no mediaUrl, no rawPayload]
                    ├── (n) OutboundMessageIdempotency  [request hash only]
                    └── (n) GroupApiOperation           [idempotency for create/add]
```

`ApiToken` and `WhatsappAccount` reference `Project` with **`ON DELETE RESTRICT`**. There is no audited project-delete workflow, so deleting a Project that still has tokens or accounts is rejected by the database. Outbound logs and group operations still cascade when a WhatsApp account is removed.

### `Admin`
`id, email (unique), passwordHash, isActive, sessionVersion, singleton (unique, always 1), createdAt, updatedAt`.

Database CHECK + unique `singleton = 1` enforces exactly one Admin row.

### `Project`
`id, name, slug (unique), isActive, webhookUrl?, webhookSecretHash?, webhookSecretPrefix?, webhookSecretLast4?, webhookEnabled, createdAt, updatedAt`.

Signing key storage mirrors `ApiToken` peppered hash, but the **hash bytes are the HMAC signing key** shown once to the Project. Dashboard fingerprint uses hex prefix/last4 of that key (not a separate `whsec_*` token).

### `ProjectWebhookDelivery`
Durable outbound queue: `payloadJson`, `payloadHash`, `status` (`PENDING|DELIVERED|FAILED|EXHAUSTED|SKIPPED`), `nextAttemptAt`, attempt metadata. `@@unique([projectId, eventId])`.

### `WhatsappAccount`
`id, projectId, label, mode (SEND_ONLY|MESSENGER), sessionName (unique), status (enum), phoneNumber?, isActive, lastConnectedAt?, lastDisconnectedAt?, createdAt, updatedAt`.

`SessionStatus`: `QR_REQUIRED | CONNECTING | CONNECTED | DISCONNECTED | ERROR`.

`sessionName` is generated (`wa_<hex>`). Never derived from project name. It is the WAHA session name (authoritative). `WAHA_SESSION_NAME` is deprecated and ignored.

Phase 2 stores `mode` (`SEND_ONLY` / `MESSENGER`). Both modes may send outbound messages. **Slice A:** `MESSENGER` enables v1 chats/history reads from WAHA NOWEB Store (no Gateway Postgres archive). **Slice B:** WAHA inbound events → durable `ProjectWebhookDelivery` queue → normalized HTTPS Project webhooks (hashed signing key, HMAC `timestamp.body`, SSRF on every attempt, in-process retry worker). Gateway returns **200 to WAHA after enqueue**, not after Project 2xx. Mode switch is Admin dashboard + CSRF only. No Messenger UI.

### `ApiToken`
`id, projectId, name, tokenHash (unique), tokenPrefix, last4, lastUsedAt?, revokedAt?, createdAt, updatedAt`.

Storage rule: only `tokenHash` (HMAC-SHA256 with `TOKEN_PEPPER`), `tokenPrefix`, `last4`. The full token is shown to the Admin exactly once after create or regenerate, via a short-lived signed httpOnly cookie (never in a URL).

### `OutboundMessageLog`
`id, whatsappAccountId, requestId (unique), chatId, messageType, status (PENDING|SENT|FAILED), wahaMessageId?, errorCode?, errorMessage?, idempotencyKey?, requestHash?, createdAt, updatedAt`.

This log exists for safe operational tracking. It is not exposed as a chat / message history UI. There is no `text`, no `mediaUrl`, no `caption`, no `rawPayload`.

### `OutboundMessageIdempotency`
`id, whatsappAccountId, idempotencyKey, requestHash, status (PROCESSING|SUCCEEDED|FAILED|OUTCOME_UNKNOWN), requestId?, messageId?, wahaMessageId?, sentAt?, errorCode?, timestamps`. Unique on `(whatsappAccountId, idempotencyKey)`. Never stores message text or URLs (hash of canonical request only).

## API contract for external systems

Preferred (Phase 2): account-scoped **v1**.

`POST /api/v1/accounts/:accountId/messages`

Headers:
- `Authorization: Bearer <PROJECT_API_TOKEN>`
- `Idempotency-Key: <8-128 chars [A-Za-z0-9._:-]>`
- `Content-Type: application/json`

The guard authenticates the Project only. It does **not** pick an account. Ownership is `{ id: accountId, projectId }`. Cross-project ids return 404.

Body (discriminated `type`, additional properties rejected):

```json
{ "type": "TEXT", "chatId": "37499111222@c.us", "text": "Hello" }
```

```json
{ "type": "IMAGE", "chatId": "37499111222@c.us", "mediaUrl": "https://cdn.example.com/a.jpg", "caption": "optional" }
```

`GET /api/v1/accounts/:accountId/chats` and `GET /api/v1/accounts/:accountId/chats/:chatId/messages` require `MESSENGER`, `CONNECTED`, and a ready NOWEB Store (`503 STORE_NOT_READY` while syncing). Message bodies are truncated to `MAX_TEXT_LENGTH`; media metadata only (`downloadMedia=false`); nothing persisted in Postgres.

`GET /api/v1/accounts` returns safe metadata only (`id`, `label`, `mode`, `status`, masked `phoneNumber`, `isActive`, timestamps). Never `sessionName`, WAHA URL, or WAHA API key.

Legacy `POST /api/messages/send` remains. Token → Project → exactly one active account, or `PROJECT_HAS_NO_ACTIVE_ACCOUNT` / `PROJECT_ACCOUNT_AMBIGUOUS`.

Headers:
- `Authorization: Bearer <API_TOKEN>`
- `Content-Type: application/json`

Body (strict, additional properties rejected):
```json
{ "chatId": "37499111222@c.us", "text": "Hello" }
```

`chatId` regex: `^[A-Za-z0-9._-]+@(c\.us|g\.us)$`.
`text`: non-empty after trim, max length `MAX_TEXT_LENGTH` (default 4096).
`phone` field: explicitly forbidden, returns `PHONE_NOT_SUPPORTED`.

Success envelope:
```json
{
  "success": true,
  "data": {
    "requestId": "req_01HXABC123",
    "messageId": "waha_or_gateway_message_id",
    "chatId": "37499111222@c.us",
    "status": "sent",
    "sentAt": "2026-05-07T13:30:00.000Z"
  }
}
```

Error envelope (uniform across the whole API):
```json
{
  "success": false,
  "error": { "code": "ERROR_CODE", "message": "Human readable.", "requestId": "req_..." }
}
```

Standardized error codes:

| HTTP | code                     | when                                                            |
|------|--------------------------|-----------------------------------------------------------------|
| 401  | `UNAUTHORIZED`           | Missing `Authorization` header.                                 |
| 401  | `INVALID_TOKEN`          | Token does not match any stored hash.                           |
| 403  | `TOKEN_REVOKED`          | Token exists but `revokedAt != null`.                           |
| 403  | `PROJECT_INACTIVE`       | Token’s Project is inactive.                                    |
| 409  | `PROJECT_HAS_NO_ACTIVE_ACCOUNT` | Project has no active WhatsApp account.                  |
| 409  | `PROJECT_ACCOUNT_AMBIGUOUS` | Project has more than one active WhatsApp account.           |
| 400  | `VALIDATION_ERROR`       | Missing `chatId` / `text`.                                      |
| 400  | `PHONE_NOT_SUPPORTED`    | Body contains `phone`.                                          |
| 400  | `INVALID_CHAT_ID`        | `chatId` does not end with `@c.us` or `@g.us`.                  |
| 409  | `ACCOUNT_INACTIVE`       | v1: the targeted account exists but `isActive = false`.         |
| 409  | `WHATSAPP_NOT_CONNECTED` | Session status is not `CONNECTED`.                              |
| 409  | `SESSION_CONFLICT`       | v1 QR: WAHA session conflict. Restart, then fetch QR again.     |
| 409  | `IDEMPOTENCY_KEY_REUSED` | Same key, different request hash.                               |
| 503  | `MESSAGE_OUTCOME_UNKNOWN`| Timeout/stale PROCESSING after WAHA may have accepted the send. |
| 503  | `WAHA_UNAVAILABLE`       | Network error / timeout reaching WAHA (legacy).                 |
| 502  | `MESSAGE_SEND_FAILED`    | WAHA returned non-2xx.                                          |

## Send flow

1. `ApiTokenGuard` extracts Bearer token. Missing → 401 `UNAUTHORIZED`.
2. Compute `tokenHash = HMAC_SHA256(TOKEN_PEPPER, raw)`. Lookup by `tokenHash`.
3. Not found → 401 `INVALID_TOKEN`. `revokedAt` set → 403 `TOKEN_REVOKED`. Inactive Project → 403 `PROJECT_INACTIVE`.
4. Resolve the Project’s **active** WhatsApp accounts:
   - exactly one → use it;
   - zero → 409 `PROJECT_HAS_NO_ACTIVE_ACCOUNT`;
   - more than one → 409 `PROJECT_ACCOUNT_AMBIGUOUS` (never pick the first).
5. Update `lastUsedAt` (best-effort, must not block send).
6. Load `WhatsappAccount` by **account id and `projectId` together**. Missing or cross-project → 404 `NOT_FOUND`. If `!isActive` or `status != CONNECTED` → 409 `WHATSAPP_NOT_CONNECTED`.
7. Validate DTO. Reject `phone`. Validate `chatId` regex. Validate `text`.
8. `requestId = req_<ulid>`. Create `OutboundMessageLog{ status: PENDING }`.
9. `wahaClient.sendText(sessionName, chatId, text)`:
   - transport error → 503, log `FAILED`.
   - non-2xx → 502, log `FAILED` with sanitized error.
   - success → log `SENT` with `wahaMessageId`.
10. Return success envelope.

## Auth & security

- Dashboard: argon2id password hashes, JWT (HS256, `JWT_SECRET`) in httpOnly SameSite=Lax cookie **`gw_session` signed with `COOKIE_SECRET`**. Unsigned `gw_session` cookies are ignored. `Secure` when `NODE_ENV=production` only. JWT payload is Admin `sub` + `sessionVersion`. Every protected request reloads Admin from the database and rejects missing/inactive/mismatched sessions. CSRF: double-submit cookie verified by guard for all non-GET dashboard routes. `helmet()` globally.
- API: Bearer only. Tokens in URL/query are rejected. Cookies are not honored on `/api/*`.
- Ownership: singleton Admin dashboard. Tokens and accounts are scoped to a Project. Project A cannot access Project B. There is no User model, Role enum, or `ADMIN_NAME`.
- Throttling (`@nestjs/throttler`) uses **named throttlers**: `default` (`RATE_LIMIT_SEND`) for legacy/dashboard, `v1-send` (`RATE_LIMIT_V1_SEND`), `v1-read` (`RATE_LIMIT_V1_READ`). Exactly one applies per request; v1 is not double-counted. Login is 5 / 15 min per IP; token create/regenerate is 3 / hour per IP. Tracker is **HMAC-SHA256(TOKEN_PEPPER, raw token)** when a Bearer token is present, otherwise client IP. Raw tokens are never used as keys. Storage is in-process `BoundedThrottlerStorage` (TTL eviction + hard max keys). **Single Gateway instance only** unless a shared Redis store is added. `app.set('trust proxy', 1)` is set in `main.ts`. Behind NAT/shared egress, IP fallback collapses many clients into one bucket — prefer Project tokens on v1.
- Privacy: no `text`, no full token, no `rawPayload`, no QR contents or pairing codes in logs. Logger has a redaction list.
- Tokens: stored as `tokenHash`, `tokenPrefix`, `last4` only. Full token returned exactly once via a project-bound signed httpOnly cookie (never `?revealed=`). A token issued for Project A is not rendered or consumed on Project B.
- WAHA: not publicly exposed. Internal Docker network only.

## Dashboard visibility rules

Admin sees: projects, WhatsApp accounts (label, mode, status, active/connected, phoneNumber if connected), QR codes and pairing codes, recent outbound operational logs (no content), API token metadata, system health, action buttons. `sessionName` is not shown on the account page (database/WAHA diagnostics only).

Strictly absent: User/Role UI, chats UI, conversations UI, message history UI, webhook logs, raw WAHA payloads, Messenger UI.
Group **management** is available only via the authenticated JSON API (`/api/groups*`), not as a Messenger dashboard. An e2e test asserts legacy dashboard paths like `/chats`, `/groups`, `/webhooks` still return 404.

## WAHA integration boundary

`src/waha/waha.client.ts` is the only place that knows WAHA URL shapes. Other modules call `WahaClient` / `WahaService`. Methods include session lifecycle (create/update with mode-specific NOWEB Store config on create, switch, restart — not on every send/QR/pairing-code), QR, pairing code, send text/media, group operations, and Store reads (`listChats`, `listChatMessages` with `downloadMedia: false`).

`WahaService` maps WAHA status strings (`STARTING`, `SCAN_QR_CODE`, `WORKING`, `FAILED`, `STOPPED`, …) to our `SessionStatus` enum and persists transitions on `WhatsappAccount`. Confirm REST paths against the running WAHA container's `/api/docs` before production upgrades.

## What is explicitly NOT built

No projects, workspaces, tenants, Product/Lead/Deal models, employee roles, or CRM workflow. No phone-number normalization / `@c.us` builder. No Messenger **UI** for chats/groups.
