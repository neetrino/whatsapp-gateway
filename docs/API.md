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
