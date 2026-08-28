# Deployment

Gateway + WAHA on one host. Public HTTPS only on the Gateway. WAHA stays on the Docker network.

## Persistence

| Data | Where |
|------|--------|
| Projects, tokens, WhatsApp accounts, admin | SQLite volume `gateway_data` → `/app/data/gateway.db` |
| WhatsApp sessions | Docker volume `waha_sessions` → `/app/.sessions` |

Do not point `DATABASE_URL` at Neon or any Postgres. Prisma is SQLite.

## Configure

```bash
cp .env.example .env
```

Required:

- `APP_URL` — public HTTPS URL
- `DATABASE_URL=file:/app/data/gateway.db` in Docker
- `COOKIE_SECRET`, `JWT_SECRET`, `TOKEN_PEPPER` — each ≥ 32 chars. **Do not rotate `TOKEN_PEPPER` after tokens are issued.**
- `WAHA_API_KEY`, `WAHA_WEBHOOK_SECRET` (≥ 32 chars)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — used only when the SQLite file has no admin yet

## First start

```bash
docker compose up -d --build
```

The entrypoint runs `prisma migrate deploy`, then starts the app.

To keep the existing NBOS project, token, and WAHA session names after leaving Neon, copy `data/neon-control-plane.json` into the volume and start once with:

```bash
CONTROL_PLANE_IMPORT=/app/data/neon-control-plane.json
```

Then unset that variable. The import upserts admin, project `nbos`, accounts (`wa_450c735fbfcd62ec`, `wa_453db52dab4d5a8f`), and the hashed API token. `TOKEN_PEPPER` must be the same value that created those hashes.

## Updates

```bash
git pull
docker compose build gateway
docker compose up -d
```

Do **not** delete `waha_sessions` or `gateway_data`.

## Reverse proxy

Terminate TLS in front of `localhost:3000`. `trust proxy` is already enabled.
