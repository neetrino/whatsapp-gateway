# Public HTTP API

Phase 2 adds an account-scoped **v1** API authenticated by a **Project** token. Legacy `/api/messages/*` and `/api/groups*` stay unchanged: they still require exactly one active WhatsApp account on the Project.

Messenger inbox UI is **not** part of this API. **MESSENGER** accounts may read chats/history via v1 below. Inbound events are delivered to a per-Project HTTPS webhook configured in the Admin dashboard (not a Project-token API).

## v1 — Project token, account-scoped

All v1 routes require `Authorization: Bearer <PROJECT_API_TOKEN>`. The guard validates the token hash (`TOKEN_PEPPER`), rejects revoked tokens and inactive Projects, and attaches **only** `apiTokenId` + `projectId`. It never selects an account.

Ownership: every account is loaded with `{ id: accountId, projectId: authenticatedProjectId }`. A Project A token against a Project B account returns **404 `NOT_FOUND`**. Inactive Project → **403 `PROJECT_INACTIVE`**. Inactive account on send → **409 `ACCOUNT_INACTIVE`**. Disconnected session on send → **409 `WHATSAPP_NOT_CONNECTED`**.

Rate limits: one named Nest throttler per route class — v1 send uses **only** `RATE_LIMIT_V1_SEND`, v1 list/status use **only** `RATE_LIMIT_V1_READ`. They are not also counted against `RATE_LIMIT_SEND`. Keys are HMAC of the Bearer token (never the raw token). If no Bearer is present, the client IP is used. `trust proxy` is `1` in `main.ts` so a reverse proxy’s `X-Forwarded-For` is honored for one hop. Behind NAT, IP fallback is coarse — use Project tokens. Storage is in-process (bounded, TTL eviction); multiple Gateway replicas do not share counters unless Redis is added later.

### `GET /api/v1/accounts`

Returns safe metadata only:

```json
{
  "success": true,
  "data": [
    {
      "id": "acc_...",
      "label": "Outbound",
      "mode": "SEND_ONLY",
      "status": "CONNECTED",
      "phoneNumber": "•••••••1222",
      "isActive": true,
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-01T00:00:00.000Z"
    }
  ]
}
```

Never includes `sessionName`, WAHA URL, or WAHA API key. Both `SEND_ONLY` and `MESSENGER` accounts are listed. Chats/history require `MESSENGER` mode, a connected session, and a ready NOWEB Store.

### `GET /api/v1/accounts/:accountId/status`

Same ownership rule. Returns `id`, `label`, `mode`, `status`, `isActive`, masked `phoneNumber` after a WAHA status refresh.

### `GET /api/v1/accounts/:accountId/chats`

Requires `MESSENGER` mode, `CONNECTED` session, and NOWEB Store enabled on the WAHA session. `SEND_ONLY` → **409 `ACCOUNT_MODE_NOT_SUPPORTED`**. Disconnected → **409 `WHATSAPP_NOT_CONNECTED`**. Store not ready after a mode switch → **503 `STORE_NOT_READY`**. Cross-project → **404 `NOT_FOUND`**.

Query: `limit`, `offset`, optional `sortBy` (`messageTimestamp` | `id` | `name`), optional `sortOrder` (`asc` | `desc`). Caps: `MAX_CHATS_PAGE`.

Response items: `id`, `name`, `lastMessageAt`, `unreadCount`. No `sessionName`, no raw WAHA `_data`.

### `GET /api/v1/accounts/:accountId/chats/:chatId/messages`

Same mode/connection/store rules as chats. Query: `limit`, `offset` only (`downloadMedia` is always false server-side). Caps: `MAX_MESSAGES_PAGE`.

Message items include `body` (text/caption) truncated to `MAX_TEXT_LENGTH` with `bodyTruncated`, plus `hasMedia`, `mediaType`, `ack`, `type`, `fromMe`, `timestamp`. Media bytes/URLs are not downloaded or persisted in Gateway Postgres.

### `POST /api/v1/accounts/:accountId/messages`

**Required header:** `Idempotency-Key` (8–128 chars: `A-Za-z0-9._:-`).

Discriminated JSON (`forbidNonWhitelisted`). `chatId` uses the same regex as legacy send. `phone` is forbidden.

**TEXT**

```json
{ "type": "TEXT", "chatId": "37499111222@c.us", "text": "Hello" }
```

**IMAGE / VIDEO**

```json
{
  "type": "IMAGE",
  "chatId": "37499111222@c.us",
  "mediaUrl": "https://cdn.example.com/photo.jpg",
  "caption": "optional"
}
```

`mediaUrl` is validated with the same SSRF rules as `POST /api/messages/send-media` (HTTPS, DNS/private addresses, redirects, MIME/type, size). Text/caption length limits are `MAX_TEXT_LENGTH` / `MAX_CAPTION_LENGTH`.

Success:

```json
{
  "success": true,
  "data": {
    "requestId": "req_01HXABC123",
    "messageId": "waha_or_gateway_message_id",
    "status": "sent",
    "sentAt": "2026-08-24T13:30:00.000Z"
  }
}
```

Gateway uses the account’s database `sessionName` as the WAHA session. Both `SEND_ONLY` and `MESSENGER` accounts may send outbound messages.

#### Idempotency

Uniqueness is `(whatsappAccountId, idempotencyKey)`. A SHA-256 **request hash** is stored (hashes of text/URL/caption — never the raw values).

| Previous state | Same key + same body | Same key + different body |
|----------------|----------------------|---------------------------|
| `SUCCEEDED` | Replay stored result, no second WAHA send | `409 IDEMPOTENCY_KEY_REUSED` |
| `PROCESSING` (fresh) | `409 IDEMPOTENT_OPERATION_IN_PROGRESS` | `409 IDEMPOTENCY_KEY_REUSED` |
| `PROCESSING` older than `IDEMPOTENCY_PROCESSING_TIMEOUT_MS` | If a matching log is `SENT`, replay that result and backfill `SUCCEEDED`. Otherwise CAS-promote to `OUTCOME_UNKNOWN`, then look once more for a `SENT` log (race with persistence) before returning `503`. Never overwrite `SUCCEEDED` | `409 IDEMPOTENCY_KEY_REUSED` |
| `FAILED` | Repeat the previous failure from the stored `errorCode` (same HTTP status; do not send again) | `409 IDEMPOTENCY_KEY_REUSED` |
| `OUTCOME_UNKNOWN` | If a matching log is `SENT`, backfill `SUCCEEDED` and replay; otherwise `503` — **not safely retryable** | `409 IDEMPOTENCY_KEY_REUSED` |

A unique constraint plus `P2002` handling prevents concurrent identical keys from sending twice. Idempotency reservation and the initial `PENDING` log are written in one Prisma transaction **before** WAHA. After WAHA returns successfully, `OutboundMessageLog` → `SENT` and `OutboundMessageIdempotency` → `SUCCEEDED` are written in a **second** Prisma transaction. That commit is **not** atomic with the WAHA HTTP call — a crash between provider success and the database commit is an unavoidable provider/DB boundary. The next same-key call reconciles from a `SENT` log if one exists; otherwise it returns `OUTCOME_UNKNOWN`. HTTP 408/502/504 and transport failures after dispatch are `OUTCOME_UNKNOWN`, not safe retries.

Replay of `SUCCEEDED` returns the stored result before current `MAX_TEXT_LENGTH` / `MAX_CAPTION_LENGTH` checks, connection checks, or media URL validation. Strict DTO shape is still validated before the service. Replay of `FAILED` repeats the previous failure using the persisted safe `errorCode` (never raw provider text): `ACCOUNT_INACTIVE` / `WHATSAPP_NOT_CONNECTED` → 409, `VALIDATION_ERROR` / `INVALID_MEDIA_URL` → 400, `IMAGE_SEND_FAILED` / `VIDEO_SEND_FAILED` / `MESSAGE_SEND_FAILED` → 502, `MESSAGE_OUTCOME_UNKNOWN` → 503.

```bash
curl -X POST "https://wa-gateway.example.com/api/v1/accounts/acc_123/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gw_live_xxxxxxxxx" \
  -H "Idempotency-Key: order-42-send-1" \
  -d '{"type":"TEXT","chatId":"37499111222@c.us","text":"Hello"}'
```

## Project webhooks (MESSENGER inbound)

Configured per Project in the Admin dashboard (`/projects/:id` → **Project webhook**). Not authenticated by Project API tokens.

**Flow:** WAHA (Docker network) → `POST /internal/waha/events` (HMAC `X-Webhook-Hmac` / `sha512` on raw body, `WAHA_WEBHOOK_SECRET`) → Gateway normalizes → HTTPS POST to the Project `webhookUrl` with Gateway HMAC headers:

| Header | Description |
|--------|-------------|
| `X-Gateway-Event-Id` | Stable id for deduplication (`@@unique([projectId, eventId])`) |
| `X-Gateway-Timestamp` | Unix ms when Gateway sent the delivery (part of the signed material) |
| `X-Gateway-Signature` | HMAC-SHA512 hex of **`${X-Gateway-Timestamp}.${rawJsonBody}`** using the Project signing key |
| `X-Gateway-Signature-Algorithm` | `sha512` |

Verify on the Project side:

1. Reject requests whose `X-Gateway-Timestamp` is outside your replay window (e.g. ±5 minutes).
2. Recompute HMAC-SHA512 over `` `${headerTimestamp}.${rawBody}` `` with the signing key you saved from the dashboard.
3. Compare to `X-Gateway-Signature` with a constant-time compare.

**Crash window:** Gateway responds **200 to WAHA after the delivery row is inserted** (`PENDING`), not after the Project endpoint returns 2xx. Retries are handled by an in-process worker (`nextAttemptAt`); not shared across Gateway replicas.

Payload shape (no raw WAHA `_data`):

```json
{
  "eventId": "evt_…",
  "accountId": "acc_…",
  "type": "message.received",
  "timestamp": "2026-08-26T09:00:00.000Z",
  "data": { "messageId": "…", "chatId": "37499111222@c.us", "body": "Hello", "bodyTruncated": false }
}
```

Event types: `message.received`, `message.ack`, `message.reaction`, `message.edited`, `message.revoked`, `session.status`. `SEND_ONLY` sessions are ignored. Delivery status (`PENDING` / `DELIVERED` / `FAILED` / `EXHAUSTED` / `SKIPPED`) is visible in the dashboard; normalized payloads are stored for retry but not shown in the UI.

## `POST /api/messages/send`

Sends a WhatsApp message through the WAHA session linked to the **API token**.  
The Gateway does **not** accept phone numbers, does **not** build `chatId`, and does **not** alter `text`.

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <API_TOKEN>` |
| `Content-Type` | Yes | `application/json` |

### Request body

```json
{
  "chatId": "37499111222@c.us",
  "text": "Здравствуйте, ваш заказ готов."
}
```

| Field | Rules |
|-------|--------|
| `chatId` | Required string. Must match a WhatsApp id ending in `@c.us` (direct) or `@g.us` (group). |
| `text` | Required non-empty string after trim. Max length from `MAX_TEXT_LENGTH` (default 4096). |
| `phone` | **Forbidden.** If present → `PHONE_NOT_SUPPORTED`. |

Unknown JSON properties are rejected (`forbidNonWhitelisted`).

### Success — `200 OK`

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

### Error envelope

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message.",
    "requestId": "req_01HXABC123"
  }
}
```

### Error codes

| HTTP | `code` | When |
|------|--------|------|
| 401 | `UNAUTHORIZED` | Missing `Authorization` header. |
| 401 | `INVALID_TOKEN` | Unknown token hash. |
| 403 | `TOKEN_REVOKED` | Token revoked. |
| 403 | `PROJECT_INACTIVE` | Token’s Project is inactive. |
| 409 | `PROJECT_HAS_NO_ACTIVE_ACCOUNT` | Project has no active WhatsApp account. |
| 409 | `PROJECT_ACCOUNT_AMBIGUOUS` | Project has more than one active WhatsApp account. |
| 400 | `VALIDATION_ERROR` | Missing `chatId` / `text`, unknown fields, text too long, token in query. |
| 400 | `PHONE_NOT_SUPPORTED` | `phone` field present. |
| 400 | `INVALID_CHAT_ID` | `chatId` suffix not `@c.us` or `@g.us`. |
| 409 | `WHATSAPP_NOT_CONNECTED` | Account inactive or session not `CONNECTED`. |
| 503 | `WAHA_UNAVAILABLE` | Cannot reach WAHA (network/timeout). |
| 502 | `MESSAGE_SEND_FAILED` | WAHA returned an error response. |
| 429 | `RATE_LIMITED` | Too many requests (throttling). |

### `curl` example

```bash
curl -X POST "https://wa-gateway.example.com/api/messages/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gw_live_xxxxxxxxx" \
  -d '{
    "chatId": "37499111222@c.us",
    "text": "Здравствуйте, ваш заказ готов."
  }'
```

### TypeScript `fetch` example

```ts
async function sendWhatsappMessage(chatId: string, text: string) {
  const response = await fetch(`${process.env.WHATSAPP_GATEWAY_URL}/api/messages/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WHATSAPP_GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({
      chatId,
      text,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || 'Failed to send WhatsApp message');
  }

  return result.data;
}
```

## `POST /api/messages/send-by-url`

Compatibility shortcut that sends a text message. **Bearer authentication is required.** API tokens must never be placed in the URL, query string, or redirect.

`GET /api/messages/send-by-url` does not send messages. If `token` is present in the query, the Gateway returns `400 VALIDATION_ERROR` and does not authenticate with that value.

### Headers

Same as text send: `Authorization: Bearer <API_TOKEN>`, `Content-Type: application/json`.

### Request body

Same as `POST /api/messages/send`: `{ "chatId", "text" }`. Do not send `token` in the body or query.

### Example

```bash
curl -X POST "https://wa-gateway.example.com/api/messages/send-by-url" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gw_live_xxxxxxxxx" \
  -d '{"chatId":"37499111222@c.us","text":"Hello"}'
```

### Response

Same success/error envelope and error codes as `POST /api/messages/send`.

## `POST /api/messages/send-media`

Sends a **real** WhatsApp image or video. The Gateway passes a **public HTTPS `mediaUrl`** to WAHA; **WAHA** fetches the file and delivers it as media. The recipient sees the image/video (and optional caption), **not** the URL as a text message.

**Engine / tier:** Whether this succeeds depends on WAHA **engine, image tag, and edition** (e.g. Core **NOWEB** vs other setups). Validate media separately in your environment; do not assume production support without a real test ([WAHA_SETUP.md](WAHA_SETUP.md)).

The Gateway does **not** download or store media binaries, does **not** persist `mediaUrl` or `caption` in the database, and does **not** expose media in the dashboard.

### Headers

Same as text send: `Authorization: Bearer <API_TOKEN>`, `Content-Type: application/json`.

### Request body

**IMAGE**

```json
{
  "chatId": "37499111222@c.us",
  "mediaType": "IMAGE",
  "mediaUrl": "https://cdn.example.com/products/photo.jpg",
  "caption": "Product photo"
}
```

**VIDEO**

```json
{
  "chatId": "37499111222@c.us",
  "mediaType": "VIDEO",
  "mediaUrl": "https://cdn.example.com/videos/demo.mp4",
  "caption": "Product video"
}
```

**Group**

```json
{
  "chatId": "120363123456789012@g.us",
  "mediaType": "IMAGE",
  "mediaUrl": "https://cdn.example.com/image.jpg",
  "caption": "Group image"
}
```

| Field | Rules |
|-------|--------|
| `chatId` | Required. Same rules as text send (`@c.us` / `@g.us`). |
| `mediaType` | Required. Exactly `IMAGE` or `VIDEO`. |
| `mediaUrl` | Required. **HTTPS only.** Must pass Gateway SSRF checks (no localhost, private IPs, `host.docker.internal`, credentials in URL, etc.). See [SECURITY.md](SECURITY.md). |
| `caption` | Optional string. Sent unchanged (no name prefix). Max length `MAX_CAPTION_LENGTH` (default 4096). |
| `phone` | **Forbidden.** → `PHONE_NOT_SUPPORTED`. |

**URL file extension (when present):** IMAGE allows `.jpg`, `.jpeg`, `.png`, `.webp`; VIDEO allows `.mp4`, `.mov`, `.webm`. If the path has no extension, the URL may still be accepted; WAHA may reject unsupported content.

**Optional `HEAD` check:** When the origin responds to `HEAD`, the Gateway may verify `Content-Type` and `Content-Length` against `MAX_IMAGE_SIZE_MB` / `MAX_VIDEO_SIZE_MB` without downloading the body. If `HEAD` is missing or unreliable, validation falls back to URL rules and WAHA’s send result.

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "requestId": "req_01HXABC123",
    "messageId": "waha_or_gateway_message_id",
    "chatId": "37499111222@c.us",
    "mediaType": "IMAGE",
    "status": "sent",
    "sentAt": "2026-05-07T13:30:00.000Z"
  }
}
```

(`mediaType` reflects the request: `IMAGE` or `VIDEO`.)

### Media-specific error codes

These apply in addition to the shared envelope above.

| HTTP | `code` | When |
|------|--------|------|
| 400 | `INVALID_MEDIA_TYPE` | `mediaType` missing or not `IMAGE` / `VIDEO`. |
| 400 | `INVALID_MEDIA_URL` | Not HTTPS, SSRF-blocked host, bad extension (when extension present), failed optional size/type `HEAD` checks. |
| 502 | `IMAGE_SEND_FAILED` | WAHA non-success sending an image. |
| 502 | `VIDEO_SEND_FAILED` | WAHA non-success sending a video. |
| 502 | `MEDIA_SEND_FAILED` | Reserved for shared failure paths if used. |

Other codes match the text endpoint where applicable (`UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_REVOKED`, `PHONE_NOT_SUPPORTED`, `INVALID_CHAT_ID`, `WHATSAPP_NOT_CONNECTED`, `WAHA_UNAVAILABLE`, `RATE_LIMITED`, `VALIDATION_ERROR`).

### `curl` examples

```bash
curl -X POST "https://wa-gateway.example.com/api/messages/send-media" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gw_live_xxxxxxxxx" \
  -d '{
    "chatId": "37499111222@c.us",
    "mediaType": "IMAGE",
    "mediaUrl": "https://cdn.example.com/photo.jpg",
    "caption": "Photo caption"
  }'
```

## `GET /health`

Returns **safe** operational status (no secrets, no raw WAHA payloads).

```json
{
  "success": true,
  "data": {
    "gateway": "ok",
    "database": "ok",
    "waha": "ok"
  }
}
```

Values may be `ok` or `unavailable` for `database` / `waha` when dependencies fail.

## Groups API

All group endpoints require `Authorization: Bearer <API_TOKEN>` using the **legacy** Project-token rule (exactly one active WhatsApp account). There is **no** v1 account-scoped Groups API.
Session is resolved internally via the token → WhatsApp account → database `sessionName`.
Clients must **not** send `session`, `accountId`, or WAHA credentials.

### `GET /api/groups`

Query: `limit` (1–200, default 100), `offset` (≥0, default 0), optional `search` (max 100, case-insensitive over normalized `name`/`id`).

Gateway calls WAHA `GET /api/{session}/groups` with `sortBy=subject`, `sortOrder=asc`, `exclude=participants`. Search is applied after normalization (not forwarded to WAHA).

```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "id": "120363123456789012@g.us",
        "name": "ACME Website",
        "participantCount": 5,
        "pictureUrl": null
      }
    ],
    "pagination": { "limit": 100, "offset": 0, "count": 1 }
  }
}
```

Rate limit: 60 / minute (route throttle).

### `POST /api/groups`

**Required header:** `Idempotency-Key` (8–128 chars: letters, digits, `._:-`).

Body:

```json
{
  "name": "ACME Website",
  "participants": ["37499111111@c.us", "37499222222@c.us"]
}
```

Rules:

- Participants: `^[0-9]+@c.us$` only (no bare phones, no `@lid` / `@s.whatsapp.net` / `@g.us`).
- Max 50 participants per request (Gateway application limit).
- Duplicates are removed before WAHA.
- Gateway does **not** normalize phone numbers.

Success:

```json
{
  "success": true,
  "data": { "id": "120363123456789012@g.us", "name": "ACME Website" }
}
```

Idempotency: same key + same body returns stored success without calling WAHA again. Same key + different body → `409 IDEMPOTENCY_KEY_REUSED`.  
Transport timeout after create may yield `503 GROUP_CREATE_OUTCOME_UNKNOWN` — **do not blind-retry**; reconcile manually.

Rate limit: 10 / minute.

### `POST /api/groups/refresh`

Refreshes WAHA group cache. Do not call on every list. Rate limit: **1 / minute**.

```json
{ "success": true, "data": { "refreshed": true } }
```

### `GET /api/groups/:groupId`

`groupId` must match `…@g.us`.

### `GET /api/groups/:groupId/participants`

Normalized participants (`role`: `participant` | `admin` | `superadmin` | `left` | `unknown`).  
`@lid` ids are returned with `phone: null`.

### `POST /api/groups/:groupId/participants`

**Required header:** `Idempotency-Key`.

Body: `{ "participants": ["37499333333@c.us"] }`.

Already-members are treated as successful no-ops. Response:

```json
{
  "success": true,
  "data": {
    "groupId": "120363123456789012@g.us",
    "status": "completed",
    "added": ["37499333333@c.us"],
    "alreadyMembers": ["37499111111@c.us"],
    "failed": []
  }
}
```

When WAHA fails at operation level without reliable per-id mapping, `status` may be `partial` with `failed[].code = PARTICIPANT_ADD_FAILED` (safe message only).

Rate limit: 20 / minute.

### `GET /api/groups/:groupId/invite-link`

Returns `{ groupId, inviteUrl }` where `inviteUrl` is `https://chat.whatsapp.com/{code}`.  
Invite URLs are sensitive — Gateway does not log them. NBOS should send the URL to clients via `POST /api/messages/send` if needed.

Rate limit: 30 / minute.

### Group-specific error codes

| HTTP | code | When |
|------|------|------|
| 400 | `INVALID_GROUP_ID` | Bad `@g.us` id |
| 400 | `INVALID_GROUP_PARTICIPANT` | Bad participant JID |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID` | Missing/bad key |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Key reused with different body |
| 409 | `IDEMPOTENT_OPERATION_IN_PROGRESS` | Concurrent same key |
| 404 | `GROUP_NOT_FOUND` | Unknown group |
| 502 | `GROUP_*_FAILED` / `GROUP_CREATE_INVALID_PROVIDER_RESPONSE` / invite invalid | Provider failure |
| 503 | `GROUP_CREATE_OUTCOME_UNKNOWN` | Create transport timeout after possible success |
| 503 | `WAHA_UNAVAILABLE` | Transport / disconnect |

### Safe retry rules

- **Safe:** `GET` list/group/participants/invite-link (and `POST refresh` within rate limit).
- **Unsafe without same Idempotency-Key:** `POST` create group.
- **Add participants:** replay same Idempotency-Key; Gateway reconciles membership.
