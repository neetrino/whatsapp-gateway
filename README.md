# nbos-whatsapp-gateway

Standalone **WhatsApp Gateway** for sending outbound WhatsApp messages via [WAHA](https://github.com/devlikeapro/waha).  
External systems (for example **NBOS**) integrate with a JSON API using **Gateway URL**, **API token**, **WhatsApp `chatId`**, plus **text** (`POST /api/messages/send`) or **image/video by public HTTPS URL** (`POST /api/messages/send-media`).

This project is **not** NBOS, **not** a plugin, and **not** a Messenger UI.

## What this is

- **HTTP JSON API:** `GET /api/v1/accounts`, `GET /api/v1/accounts/:accountId/status`, `POST /api/v1/accounts/:accountId/messages` (Project token, account-scoped, `Idempotency-Key` on send). **MESSENGER** accounts also expose chats/history (WAHA Store proxy, not stored) and inbound HTTPS webhooks. Legacy `POST /api/messages/send` and `POST /api/messages/send-media` remain.
- Minimal **dashboard** (server-rendered) for the singleton **Admin**: login, **Projects** (API tokens + WhatsApp accounts, QR, session actions), system health.
- **Admin (singleton) → Project → ApiTokens[] + WhatsappAccounts[]**. Tokens and accounts belong to a Project, not to a User. There is no User/Role model and no `ADMIN_NAME`.

## What this is not

- No chat list, inbox, message history, groups UI, or webhook log UI.
- No storage of messages, outbound logs, or webhook payloads. SQLite holds admin, projects, tokens, WhatsApp account connections, and **24-hour send/group idempotency keys**.
- No phone-number send path: only WhatsApp `chatId` (`@c.us` / `@g.us`).
- No modification of message text (no name prefix, no signatures).

## Architecture

```mermaid
flowchart LR
  Client["External system / NBOS"] -->|"Bearer + JSON"| Gateway["WhatsApp Gateway\nNestJS + Prisma"]
  Browser["Admin browser"] -->|"signed httpOnly gw_session"| Gateway
  Gateway -->|"Internal HTTP"| WAHA["WAHA container"]
  WAHA --> WhatsApp["WhatsApp network"]
  Gateway --> SQLite["SQLite file"]
```

Public exposure: **Gateway only** (HTTPS). WAHA stays on the Docker internal network.

## Tech stack

- **NestJS** + **TypeScript** (strict)
- **Prisma** + **SQLite**
- **argon2id** (dashboard passwords), **HMAC-SHA256** with `TOKEN_PEPPER` (API tokens)
- **Handlebars** dashboard (no SPA)
- **Docker** + **docker-compose** (Gateway + WAHA + SQLite volume + WAHA sessions volume)

## Quick start (local)

1. Copy [`.env.example`](.env.example) to `.env` and fill secrets (≥ 32 chars).
2. Set `DATABASE_URL` to an **absolute** `file:...` path (see `.env.example`).
3. Install and migrate:

```bash
npm install
npx prisma migrate deploy
npm run start:dev
```

Admin is created on first start from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if the SQLite file has no admin yet.

4. Open `http://localhost:3000/login`, sign in as the seeded Admin, create a **Project**, add WhatsApp accounts, scan QR, create API tokens.

## Environment

See [`.env.example`](.env.example). Required variables are validated at startup; the process exits with a clear error if anything is missing.

Key webhook / inbound variables:

| Variable | Purpose |
|----------|---------|
| `GATEWAY_INTERNAL_URL` | Docker-internal base URL WAHA calls (`http://gateway:3000` in compose) |
| `WAHA_WEBHOOK_SECRET` | HMAC secret for `POST /internal/waha/events` (≥ 32 chars) |
| `WEBHOOK_DELIVERY_TIMEOUT_MS` | Optional outbound Project webhook HTTP timeout (default 10000) |

Compose service names: **`gateway`** (NestJS) and **`waha`** (WAHA). WAHA is not published to the host in production compose.

## Docker

```bash
docker compose build
docker compose up -d
```

The bundled WAHA service uses the pinned image **`devlikeapro/waha:noweb-2026.8.1`** with **`WHATSAPP_DEFAULT_ENGINE=NOWEB`** (set on the WAHA container). Each Gateway account uses its database **`sessionName`** as the WAHA session. Do **not** publish the WAHA port in production. **`WAHA_SESSION_NAME` is deprecated and ignored.** Live two-session verification is **not** claimed until:

```bash
docker compose -f docker-compose.yml -f docker-compose.integration.yml up -d waha
WAHA_BASE_URL=http://127.0.0.1:3001 WAHA_INTEGRATION=1 npm run test:waha
```

See [docs/WAHA_SETUP.md](docs/WAHA_SETUP.md).

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Hetzner + reverse proxy guidance.

## External API (summary)

- **v1 (preferred):** `GET /api/v1/accounts`, `GET /api/v1/accounts/:id/status`, `POST /api/v1/accounts/:id/messages` with `Authorization: Bearer <PROJECT_TOKEN>` and `Idempotency-Key` on send. Discriminated body `type: TEXT | IMAGE | VIDEO`. See [docs/API.md](docs/API.md).
- **Legacy text:** `POST /api/messages/send` — same auth, JSON `{ "chatId", "text" }` only. Requires exactly one active account on the Project.
- **Legacy media:** `POST /api/messages/send-media`.

Full contract: [docs/API.md](docs/API.md).

### Example client (NBOS / any service)

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

Image and video helpers (same auth; `mediaUrl` must be a **public HTTPS** URL) are in [docs/NBOS_INTEGRATION.md](docs/NBOS_INTEGRATION.md).

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/API.md](docs/API.md) | Public send API, errors, curl |
| [docs/NBOS_INTEGRATION.md](docs/NBOS_INTEGRATION.md) | What NBOS needs (URL + token + chatId + text or media URL) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker, SQLite volume, HTTPS |
| [docs/SECURITY.md](docs/SECURITY.md) | Tokens, cookies, WAHA isolation |
| [docs/WAHA_SETUP.md](docs/WAHA_SETUP.md) | WAHA container, API key, sessions volume |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Runbook, health, backups |

## Testing

```bash
npm test
npm run test:e2e
# Optional live WAHA multi-session (loopback overlay, never public bind):
# docker compose -f docker-compose.yml -f docker-compose.integration.yml up -d waha
# WAHA_BASE_URL=http://127.0.0.1:3001 WAHA_INTEGRATION=1 npm run test:waha
```

## License

Proprietary / internal — adjust as needed.
