# Deployment (Hetzner VPS + Docker)

## Overview

- **Gateway** container: public HTTPS via reverse proxy.
- **WAHA** container: **internal only** (Docker network), persistent session volume.
- **Neon PostgreSQL**: `DATABASE_URL` from Neon console (TLS).

## 1. Provision VPS

- Ubuntu 22.04+ or similar on Hetzner.
- Open inbound **443** (and **80** for ACME if needed). **Do not** publish WAHA port `3000`.

## 2. Install Docker

Follow Docker Engine + Compose plugin installation for your distro.

## 3. Clone and configure

```bash
git clone <your-repo-url> nbos-whatsapp-gateway
cd nbos-whatsapp-gateway
cp .env.example .env
```

Edit `.env`:

- Strong secrets (`COOKIE_SECRET`, `JWT_SECRET`, `TOKEN_PEPPER`) — each ≥ 32 random bytes as hex/base64.
- `DATABASE_URL` from Neon (include `sslmode=require` if required).
- `APP_URL` / `GATEWAY_PUBLIC_URL` — public HTTPS URL.
- `WAHA_BASE_URL=http://waha:3000` (matches `docker-compose.yml` service name).
- `WAHA_API_KEY` — shared secret for WAHA HTTP API (see [WAHA_SETUP.md](WAHA_SETUP.md)).

## 4. Database migrations

From any environment with Node.js and this repo (CI, admin laptop, or a one-off container with dev dependencies):

```bash
export DATABASE_URL="postgresql://..."
npx prisma migrate deploy
ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... npm run prisma:seed
```

The production Docker image is runtime-only (no `ts-node`). Run the **seed once** from a dev/CI environment against Neon.

To apply migrations using the production image (includes the `prisma` CLI):

```bash
docker compose run --rm gateway sh -c "npx prisma migrate deploy"
```

## 5. Start stack

```bash
docker compose up -d --build
```

Gateway listens on host port `3000` by default; put a reverse proxy in front.

## 6. Reverse proxy + HTTPS

### Caddy (example)

```caddy
wa-gateway.example.com {
  reverse_proxy localhost:3000
}
```

### nginx (sketch)

- Terminate TLS.
- `proxy_pass http://127.0.0.1:3000;`
- Forward `X-Forwarded-For`, `X-Forwarded-Proto`.

Ensure `trust proxy` is enabled in production (already set in `main.ts`).

## 7. WAHA persistence

`docker-compose.yml` mounts `waha_sessions:/app/.sessions`.  
Back up this Docker volume with your backup strategy (see [OPERATIONS.md](OPERATIONS.md)).

## 8. Updates

```bash
git pull
docker compose build --no-cache gateway
docker compose up -d
docker compose run --rm gateway npx prisma migrate deploy
```

## 9. Neon notes

- Use Neon’s pooled connection string for serverless-friendly pooling if desired.
- Rotate credentials via Neon dashboard if compromised.
