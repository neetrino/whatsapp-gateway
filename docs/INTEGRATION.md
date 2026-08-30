# Integrating with WhatsApp Gateway

Any external project talks **only** to this Gateway over HTTPS.  
It does **not** call WAHA, handle QR codes, or manage WhatsApp sessions.

Use this file as the handoff: env, send, chat picker, groups, inbound/messenger, errors, and what the Gateway will never do. Take the sections you need.

## Environment

| Variable | Description |
|----------|-------------|
| `WHATSAPP_GATEWAY_URL` | Public base URL, e.g. `https://whatsapp.example.com` |
| `WHATSAPP_GATEWAY_TOKEN` | Project API token from the Gateway dashboard (`gw_live_…` / `gw_test_…`) |

Create a **Project** in the Gateway dashboard for each integrating app. Each project has its own token and WhatsApp account(s).

Every request:

- `Authorization: Bearer {WHATSAPP_GATEWAY_TOKEN}`
- `Content-Type: application/json` on POST/PUT

There is **one token type**. `SEND_ONLY` vs `MESSENGER` is the **WhatsApp account mode** in the Gateway dashboard, not a property of the token. Switch mode, then **Restart** the session. Do not recreate the token.

- `SEND_ONLY` — outbound send and group management work. Personal chats in `GET /api/chats` may be empty. Inbound webhooks and v1 history are off.
- `MESSENGER` — same outbound API, plus recent personal chats, inbound project webhooks, and v1 chat history.

## Identifiers

The Gateway **never** accepts a bare phone and **never** builds a WhatsApp id.

| Kind | Format | Who builds it |
|------|--------|----------------|
| Direct chat | `{digits}@c.us` | Your app, from the user’s number (digits only, no `+` or spaces) |
| Group | `{id}@g.us` | Gateway on create, or picker / your stored binding |

Field `phone` is **forbidden** (`PHONE_NOT_SUPPORTED`).  
`@lid`, `@s.whatsapp.net`, and other suffixes are invalid on send and on participant lists.

## 1. First message from a form

`POST {WHATSAPP_GATEWAY_URL}/api/messages/send`

```json
{ "chatId": "37499111222@c.us", "text": "Hello" }
```

Same endpoint writes to a group if `chatId` is `…@g.us`.

Image / video (public HTTPS URL WAHA can fetch):

`POST {WHATSAPP_GATEWAY_URL}/api/messages/send-media`

```json
{
  "chatId": "37499111222@c.us",
  "mediaType": "IMAGE",
  "mediaUrl": "https://cdn.example.com/photo.jpg",
  "caption": "Optional"
}
```

`mediaType` is `IMAGE` or `VIDEO`. On WAHA Core + NOWEB, treat **text** as the primary path until you smoke-test media.

Success:

```json
{
  "success": true,
  "data": {
    "requestId": "…",
    "messageId": "…",
    "chatId": "37499111222@c.us",
    "status": "sent",
    "sentAt": "…"
  }
}
```

## 2. Pick an existing chat or group

Do **not** use `GET /api/groups` as the picker. That list is groups-only (management).

`GET {WHATSAPP_GATEWAY_URL}/api/chats?limit=20&offset=0&search=`

```json
{
  "success": true,
  "data": {
    "items": [
      { "id": "120363…@g.us", "name": "Qualitech", "type": "group" },
      { "id": "37499…@c.us", "name": "Armen", "type": "direct" }
    ],
    "pagination": { "limit": 20, "offset": 0, "count": 2 }
  }
}
```

Order is the WhatsApp inbox: **last message first**, not group creation date. A group created a year ago that got a message a minute ago is at the top. Conversations with no last-message activity (dead / unused groups) come after the live inbox, by name. `offset` continues that same list.

In your UI:

- Label `type=group` vs `type=direct`.
- Title: `name` if non-empty, otherwise `id`. Gateway fills a missing name from WAHA get-by-id on the current page; if still empty, the WAHA store has no subject.
- Search: send `search=` on **every** request. Do not filter only the current page in the browser.
- Load more: raise `offset` by `limit`, keep the same `search`.
- After pick: store `id` + `type` on your record.

If the account is `SEND_ONLY` or Store is not ready, `direct` items may be missing; groups still return.

Form-first-message stays: your app builds `{digits}@c.us` and calls send. The picker is for **existing** threads.

## 3. Groups

Your app owns which group is bound to which record and who to add/remove.  
`Idempotency-Key` (8–128 chars: `A-Za-z0-9._:-`) is **required** on every write below. Same key + same body replays the stored result. Same key + different body → `409 IDEMPOTENCY_KEY_REUSED`. Keys expire after 24 hours.

Typical flow:

1. Optional: `GET /api/chats?search=` to reuse a group, or `GET /api/groups` if you only need groups.
2. `POST /api/groups` — create and seed member JIDs (`…@c.us` only). Store returned `id`.
3. Later: add / remove members, rename, invite link for people who should join themselves.
4. Send the invite URL with `POST /api/messages/send` to a personal `…@c.us`. Do **not** auto-add that person as a participant unless you intend to.

### List / get (no idempotency key)

| Method | Path |
|--------|------|
| `GET` | `/api/groups?limit&offset&search=` |
| `GET` | `/api/groups/:groupId` |
| `GET` | `/api/groups/:groupId/participants` |
| `GET` | `/api/groups/:groupId/invite-link` |
| `POST` | `/api/groups/refresh` (rate-limited; not on every list) |

Invite: `{ "groupId", "inviteUrl": "https://chat.whatsapp.com/{code}" }`. Do not log the URL.

### Create

`POST /api/groups` + `Idempotency-Key`

```json
{ "name": "ACME Website", "participants": ["37499111111@c.us"] }
```

Max 50 participants per request. Duplicates dropped. No phone normalization.

Success: `{ "id": "120363…@g.us", "name": "ACME Website" }`.  
Transport timeout may be `503 GROUP_CREATE_OUTCOME_UNKNOWN` — **do not** retry with a new key.

### Rename

`PUT /api/groups/:groupId` + `Idempotency-Key`

```json
{ "name": "New title" }
```

Success: `{ "id", "name" }`. Unknown outcome: `GROUP_RENAME_OUTCOME_UNKNOWN`.

### Add members

`POST /api/groups/:groupId/participants` + `Idempotency-Key`

```json
{ "participants": ["37499333333@c.us"] }
```

Already-members are successful no-ops (`alreadyMembers`).

### Remove members

`POST /api/groups/:groupId/participants/remove` + `Idempotency-Key`

```json
{ "participants": ["37499333333@c.us"] }
```

```json
{
  "groupId": "120363…@g.us",
  "status": "completed",
  "removed": ["37499333333@c.us"],
  "alreadyAbsent": [],
  "failed": []
}
```

### Leave

`POST /api/groups/:groupId/leave` + `Idempotency-Key`  
Empty body. Success: `{ "groupId", "left": true }`.  
Unknown outcome: `GROUP_LEAVE_OUTCOME_UNKNOWN`.

### Send in a group

Same as §1: `POST /api/messages/send` with `chatId` = group id.

## 4. Inbox (inbound + history)

Not a Gateway UI. Your app is the inbox.

Requires account mode **MESSENGER** and a Restart after switching.

**Inbound** (project webhook configured in the Gateway dashboard):

- `message.received`, `message.ack`, `message.reaction`, `message.edited`, `message.revoked`, `session.status`
- Payload has `chatId` (`@c.us` or `@g.us`), never raw WAHA `_data`
- `SEND_ONLY` sessions are ignored

**History** (account-scoped v1; different path, same project token):

- `GET /api/v1/accounts`
- `GET /api/v1/accounts/:accountId/chats`
- `GET /api/v1/accounts/:accountId/chats/:chatId/messages`
- `POST /api/v1/accounts/:accountId/messages` (`Idempotency-Key`, no `phone`)

`SEND_ONLY` → `409 ACCOUNT_MODE_NOT_SUPPORTED`. Store warming → `503 STORE_NOT_READY`.

Details: [API.md](API.md) v1 section.

## Errors (common)

Envelope: `{ "success": false, "error": { "code", "message", "requestId" } }`.

| HTTP | code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Bad body / query |
| 400 | `PHONE_NOT_SUPPORTED` | `phone` field present |
| 400 | `INVALID_CHAT_ID` / `INVALID_GROUP_ID` / `INVALID_GROUP_PARTICIPANT` | Wrong JID |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID` | Missing/bad key |
| 401 / 403 | `INVALID_TOKEN` / `TOKEN_REVOKED` / `UNAUTHORIZED` | Token |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key, different body |
| 409 | `WHATSAPP_NOT_CONNECTED` | Scan QR in Gateway dashboard |
| 404 | `GROUP_NOT_FOUND` | Unknown group |
| 429 | `RATE_LIMITED` | Slow down |
| 502 | `GROUP_*_FAILED` / `MESSAGE_SEND_FAILED` / media codes | Provider rejected |
| 503 | `WAHA_UNAVAILABLE` / `*_OUTCOME_UNKNOWN` / `STORE_NOT_READY` | Transport / unknown write / store |

`WHATSAPP_NOT_CONNECTED` is fixed in the Gateway dashboard, not in your app.

## What the Gateway does not do

- Convert a phone number into `chatId`
- Delete a group (WAHA NOWEB cannot)
- Group avatar, promote/demote, join-by-invite, “admins only” settings
- Messenger UI, chat archive, or store message text in Gateway Postgres
- Talk to official Meta Cloud API (this is WAHA NOWEB)

## TypeScript snippets

```ts
const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL;
const token = process.env.WHATSAPP_GATEWAY_TOKEN;

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
};

async function sendText(chatId: string, text: string) {
  const response = await fetch(`${gatewayUrl}/api/messages/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ chatId, text }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || 'Failed to send WhatsApp message');
  }
  return result.data;
}

async function listChats(query: { limit?: number; offset?: number; search?: string }) {
  const params = new URLSearchParams();
  if (query.limit) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));
  if (query.search) params.set('search', query.search);
  const response = await fetch(`${gatewayUrl}/api/chats?${params}`, { headers });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || 'Failed to list chats');
  }
  return result.data;
}

async function renameGroup(groupId: string, name: string, idempotencyKey: string) {
  const response = await fetch(`${gatewayUrl}/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    headers: { ...headers, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ name }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || 'Failed to rename group');
  }
  return result.data;
}
```

Contracts and rate limits: [API.md](API.md).
