# NBOS integration

NBOS (or any external system) talks **only** to this Gateway over HTTPS.  
It does **not** run WAHA, does not handle QR codes, and does not manage WhatsApp sessions.

## Environment variables in NBOS

| Variable | Description |
|----------|-------------|
| `WHATSAPP_GATEWAY_URL` | Public base URL, e.g. `https://wa-gateway.example.com` |
| `WHATSAPP_GATEWAY_TOKEN` | API token created in the Gateway dashboard (`gw_live_...` or `gw_test_...`) |

## Text messages

`POST {WHATSAPP_GATEWAY_URL}/api/messages/send`

Headers:

- `Content-Type: application/json`
- `Authorization: Bearer {WHATSAPP_GATEWAY_TOKEN}`

Body:

```json
{
  "chatId": "37499111222@c.us",
  "text": "Message"
}
```

- Direct chat: `...@c.us`
- Group: `...@g.us`

NBOS is responsible for supplying a valid WhatsApp `chatId`. The Gateway does **not** convert phone numbers.

## Image and video (by public URL)

**Operational note:** Media sending depends on the Gateway’s WAHA **engine, image tag, and tier** and must be **verified separately**. With **WAHA Core + NOWEB**, treat **text** (`POST /api/messages/send`) as the primary supported integration until you complete a real image/video smoke test. The endpoint below remains available; do not assume production media support without that test (some setups may need **WAHA Plus** or a different engine).

`POST {WHATSAPP_GATEWAY_URL}/api/messages/send-media`

Same headers as text. Body:

```json
{
  "chatId": "37499111222@c.us",
  "mediaType": "IMAGE",
  "mediaUrl": "https://cdn.example.com/products/photo.jpg",
  "caption": "Product photo"
}
```

- `mediaType` is `IMAGE` or `VIDEO`.
- `mediaUrl` is **only** the source file URL on your CDN or object storage. It must be **HTTPS** and **publicly reachable** from WAHA (see [SECURITY.md](SECURITY.md) for SSRF rules).
- **WhatsApp delivers real media:** WAHA downloads `mediaUrl` and sends image/video to the chat. The Gateway does **not** send the URL as a plain text message and does **not** use the text-send endpoint for media.
- `caption` is optional; if present it is sent **unchanged** (no name prefix).
- The Gateway does **not** store media files, `mediaUrl`, or captions in the database; the dashboard has no media gallery.

**VIDEO example**

```json
{
  "chatId": "37499111222@c.us",
  "mediaType": "VIDEO",
  "mediaUrl": "https://cdn.example.com/videos/demo.mp4",
  "caption": "Product video"
}
```

## Success response

```json
{
  "success": true,
  "data": {
    "requestId": "...",
    "messageId": "...",
    "chatId": "...",
    "status": "sent",
    "sentAt": "..."
  }
}
```

## What NBOS does **not** need

- WAHA URL or API key
- QR / session lifecycle
- Webhook endpoints for this Gateway
- Messenger UI or WhatsApp account admin (handled in Gateway dashboard)

## Example clients (TypeScript)

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

async function sendWhatsappImage(chatId: string, imageUrl: string, caption?: string) {
  const response = await fetch(`${process.env.WHATSAPP_GATEWAY_URL}/api/messages/send-media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WHATSAPP_GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({
      chatId,
      mediaType: 'IMAGE',
      mediaUrl: imageUrl,
      caption,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || 'Failed to send WhatsApp image');
  }

  return result.data;
}

async function sendWhatsappVideo(chatId: string, videoUrl: string, caption?: string) {
  const response = await fetch(`${process.env.WHATSAPP_GATEWAY_URL}/api/messages/send-media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WHATSAPP_GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({
      chatId,
      mediaType: 'VIDEO',
      mediaUrl: videoUrl,
      caption,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || 'Failed to send WhatsApp video');
  }

  return result.data;
}
```

## Operational note

If the Gateway returns `WHATSAPP_NOT_CONNECTED`, the WhatsApp session must be re-established via the Gateway dashboard (QR / session actions). NBOS cannot fix that through the send API.

For media, `INVALID_MEDIA_URL` usually means the URL failed SSRF checks or extension rules; `IMAGE_SEND_FAILED` / `VIDEO_SEND_FAILED` mean WAHA rejected or could not send the file—verify the URL is reachable from the WAHA container, the format is supported, and your WAHA **engine/tier** actually supports that media path (see the warning in the media section above).
