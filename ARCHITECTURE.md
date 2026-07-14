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

1. One `User` has exactly one `WhatsappAccount`.
2. One `WhatsappAccount` has exactly one WAHA session.
3. One `WhatsappAccount` may have one or more `ApiToken`s.
4. An `ApiToken` is bound to exactly one `WhatsappAccount`. The token decides which account sends.
5. External systems pass only `chatId` and `text`. Gateway sends `text` exactly as received.

## Top-level architecture

```
External system / NBOS
   │  POST /api/messages/send  { chatId, text }   (Bearer <API_TOKEN>)
   ▼
WhatsApp Gateway  (NestJS, Prisma, Neon Postgres)
   │  internal HTTP
   ▼
WAHA  (devlikeapro/waha, Docker)
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
| `auth`               | Dashboard login/logout. Argon2id password hashes. JWT in httpOnly cookie. CSRF.                 |
| `users`              | Admin CRUD over users. Auto-creates a `WhatsappAccount` on user creation. Password reset.       |
| `whatsapp-accounts`  | Account read, status, restart/stop, QR retrieval. Strict role + ownership checks.               |
| `api-tokens`         | Generate/list/revoke/regenerate. HMAC-SHA256 with `TOKEN_PEPPER`. Show-once on create.          |
| `waha`               | Isolated WAHA boundary. Only place that knows WAHA URL shape and status strings.                |
| `messages`           | `POST /api/messages/send` (+ media). ApiToken guard. Strict DTO. Outbound log lifecycle.          |
| `groups`             | Group lifecycle API: list/create/get/refresh/participants/invite-link. Idempotent mutations.     |
| `health`             | `GET /health` returning `{ gateway, database, waha }`.                                          |
| `dashboard`          | Handlebars-rendered admin/user pages and minimal JSON status endpoint for QR poll.              |

Strict rule: WAHA-specific URLs, headers, and status strings live only inside `src/waha/*`. Other modules consume `WahaService` only.

## Data model

```
User (1) ──── (1) WhatsappAccount (1) ──── (n) ApiToken
                            │
                            ├─── (n) OutboundMessageLog   [no text, no rawPayload]
                            └─── (n) GroupApiOperation    [idempotency for create/add]
```

### `User`
`id, name, email (unique), passwordHash, role (ADMIN|USER), isActive, createdAt, updatedAt`.

### `WhatsappAccount`
`id, userId (unique → 1:1), label, sessionName (unique), status (enum), phoneNumber?, isActive, lastConnectedAt?, lastDisconnectedAt?, createdAt, updatedAt`.

`SessionStatus`: `QR_REQUIRED | CONNECTING | CONNECTED | DISCONNECTED | ERROR`.

`sessionName` is generated from the account id (`wa_<cuid>`). Never derived from user name.

### `ApiToken`
`id, whatsappAccountId, name, tokenHash (unique), tokenPrefix, last4, lastUsedAt?, revokedAt?, createdAt, updatedAt`.

Storage rule: only `tokenHash` (HMAC-SHA256 with `TOKEN_PEPPER`), `tokenPrefix`, `last4`. The full token is shown to the user exactly once, immediately after create or regenerate.

### `OutboundMessageLog`
`id, whatsappAccountId, requestId (unique), chatId, status (PENDING|SENT|FAILED), wahaMessageId?, errorCode?, errorMessage?, createdAt, updatedAt`.

This log exists for safe operational tracking. It is not exposed as a chat / message history UI. There is no `text`, no `rawPayload`.

## API contract for external systems

`POST /api/messages/send`

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
| 400  | `VALIDATION_ERROR`       | Missing `chatId` / `text`.                                      |
| 400  | `PHONE_NOT_SUPPORTED`    | Body contains `phone`.                                          |
| 400  | `INVALID_CHAT_ID`        | `chatId` does not end with `@c.us` or `@g.us`.                  |
| 409  | `WHATSAPP_NOT_CONNECTED` | Account not active or session status is not `CONNECTED`.       |
| 503  | `WAHA_UNAVAILABLE`       | Network error / timeout reaching WAHA.                          |
| 502  | `MESSAGE_SEND_FAILED`    | WAHA returned non-2xx.                                          |

## Send flow

1. `ApiTokenGuard` extracts Bearer token. Missing → 401 `UNAUTHORIZED`.
2. Compute `tokenHash = HMAC_SHA256(TOKEN_PEPPER, raw)`. Lookup by `tokenHash`.
3. Not found → 401 `INVALID_TOKEN`. `revokedAt` set → 403 `TOKEN_REVOKED`.
4. Update `lastUsedAt` (best-effort, must not block send).
5. Load `WhatsappAccount`. If `!isActive` or `status != CONNECTED` → 409 `WHATSAPP_NOT_CONNECTED`.
6. Validate DTO. Reject `phone`. Validate `chatId` regex. Validate `text`.
7. `requestId = req_<ulid>`. Create `OutboundMessageLog{ status: PENDING }`.
8. `wahaClient.sendText(sessionName, chatId, text)`:
   - transport error → 503, log `FAILED`.
   - non-2xx → 502, log `FAILED` with sanitized error.
   - success → log `SENT` with `wahaMessageId`.
9. Return success envelope.

## Auth & security

- Dashboard: argon2id password hashes, JWT (HS256, `JWT_SECRET`) in httpOnly SameSite=Lax cookie signed with `COOKIE_SECRET`; `Secure` when `NODE_ENV=production` only (local/Docker dev: `NODE_ENV=development` over HTTP). CSRF: double-submit cookie verified by guard for all non-GET dashboard routes. `helmet()` globally.
- API: Bearer only on `/api/messages/*`. Cookies are not honored on `/api/*`.
- RBAC: `@Roles(Role.ADMIN)` on admin-only routes; user-scoped services filter every query by `currentUser.id` unless caller is admin.
- Throttling (`@nestjs/throttler`):
  - `login`: 5 / 15 min per IP (fixed in `AuthController`).
  - `send`: per-token bucket (`RATE_LIMIT_SEND`), with per-IP fallback.
  - `token-regen`: 3 / hour per user.
- Privacy: no `text`, no full token, no `rawPayload`, no QR contents in logs. Logger has a redaction list.
- Tokens: stored as `tokenHash`, `tokenPrefix`, `last4` only. Full token returned exactly once.
- WAHA: not publicly exposed. Internal Docker network only.

## Dashboard visibility rules

Admin sees: users, all WhatsApp accounts (label, sessionName, status, phoneNumber if connected, lastConnectedAt), QR codes, API token metadata, system health, action buttons.

User sees: own WhatsApp account, own QR, own status, own token metadata.

Strictly absent for both roles: chats UI, conversations UI, message history UI, webhook logs, raw WAHA payloads.  
Group **management** is available only via the authenticated JSON API (`/api/groups*`), not as a Messenger dashboard. An e2e test asserts legacy dashboard paths like `/chats`, `/groups`, `/webhooks` still return 404.

## WAHA integration boundary

`src/waha/waha.client.ts` is the only place that knows WAHA URL shapes. Other modules call `WahaClient` / `WahaService`. Methods include session lifecycle, send text/media, and group operations (`listGroups`, `createGroup`, `getGroup`, `refreshGroups`, `listGroupParticipants`, `addGroupParticipants`, `getGroupInviteCode`).

`WahaService` maps WAHA status strings (`STARTING`, `SCAN_QR_CODE`, `WORKING`, `FAILED`, `STOPPED`, …) to our `SessionStatus` enum and persists transitions on `WhatsappAccount`. Confirm REST paths against the running WAHA container's `/api/docs` before production upgrades.

## What is explicitly NOT built

No projects, workspaces, tenants, Product/Lead/Deal models, employee roles, or CRM workflow. No phone-number normalization / `@c.us` builder. No Messenger UI for chats/groups. No webhook endpoint in v1 — session status is refreshed on demand. Product-to-group binding and client invite messaging belong to NBOS.
