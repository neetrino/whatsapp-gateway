# Public HTTP API

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
| 400 | `VALIDATION_ERROR` | Missing `chatId` / `text`, unknown fields, text too long. |
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

## `GET /api/messages/send-by-url`

Shortcut endpoint for tools that can only open a URL. Sends a text message via query parameters.

> Security note: passing API tokens in URL query is less secure than `Authorization: Bearer ...` because URLs may be logged by browsers, proxies, and server logs. Use `POST /api/messages/send` whenever possible.

### Query parameters

| Parameter | Required | Description |
|----------|----------|-------------|
| `token` | Yes | Raw API token value (`gw_live_...`). |
| `chatId` | Yes | Same rules as text send (`@c.us` / `@g.us`). |
| `text` | Yes | Message text (same validation and max length as text send). |

### Example

```bash
curl "https://wa-gateway.example.com/api/messages/send-by-url?token=gw_live_xxxxxxxxx&chatId=37499111222%40c.us&text=Hello%20from%20URL"
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

All group endpoints require `Authorization: Bearer <API_TOKEN>` (same token binding as message send).  
Session is resolved internally via the token → WhatsApp account → `WahaService.effectiveSessionName`.  
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
