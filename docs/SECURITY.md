# Security model

## API tokens

- Raw tokens are shown **exactly once** after create/regenerate in the dashboard.
- Database stores **`tokenHash` only** (HMAC-SHA256 with `TOKEN_PEPPER`), plus `tokenPrefix` and `last4` for display.
- `TOKEN_PEPPER` must be high-entropy (≥ 32 chars) and treated like a root secret.
- Revoked tokens fail closed with `TOKEN_REVOKED`.
- Send endpoint is rate-limited (global throttler + per-route limits on login/token regen).

## Dashboard authentication

- Passwords hashed with **argon2id** (`argon2` package).
- Session uses **JWT in an httpOnly, SameSite=Lax cookie** — `Secure` is set only when `NODE_ENV=production`. Use `NODE_ENV=development` for local `http://localhost` (including Docker Compose with `.env`). Never `localStorage`.
- **CSRF**: double-submit cookie (`gw_csrf`) verified on all non-GET dashboard mutations.
- **RBAC**: `ADMIN` vs `USER` enforced by guards; users can only access their own WhatsApp account and tokens.

## WAHA isolation

- WAHA must **not** be exposed publicly without VPN / IP allowlist / strong auth.
- Prefer Docker **internal DNS** only (`http://waha:3000` from Gateway).
- Set `WAHA_API_KEY` and configure WAHA to require it (see [WAHA_SETUP.md](WAHA_SETUP.md)).

## Privacy / data minimization

- **No message text** in `OutboundMessageLog` or UI.
- **No `mediaUrl`, captions, or media binaries** in the database. Logs may record safe metadata only (e.g. `messageType` TEXT / IMAGE / VIDEO, `chatId`, status, ids, errors).
- **No webhook log UI**, no raw payload storage by default.
- Structured logs must **not** include message bodies, full API tokens, passwords, or raw WAHA message payloads.

## SSRF protection (`send-media`)

External callers supply `mediaUrl`; WAHA fetches it. To prevent the Gateway from accepting URLs that point at internal services (even though WAHA performs the fetch), the Gateway validates every `mediaUrl` with `validatePublicHttpsUrl` in `src/common/utils/public-url.ts`:

- **HTTPS only**; no `http://`, `file://`, or credentials in the userinfo.
- Blocks **localhost**, **`.local`**, **`host.docker.internal`**, **private IPv4/IPv6 ranges** (including CGNAT `100.64.0.0/10`), **link-local**, and **loopback** literals.
- For non-literal hostnames, **DNS resolution**; if any resolved address is private, the URL is rejected.

Optional **`HEAD`** checks (no body download) may enforce `Content-Type` and max size (`MAX_IMAGE_SIZE_MB`, `MAX_VIDEO_SIZE_MB`). Tune limits via environment variables; see [`.env.example`](../.env.example).

## Webhooks

- v1 does **not** expose a public WAHA webhook endpoint. If added later: verify `WAHA_WEBHOOK_SECRET` header, never display events in UI.

## Environment secrets

- Validate all required env vars at boot (`class-validator` on `process.env`).
- Never commit `.env`. Rotate `JWT_SECRET`, `COOKIE_SECRET`, `TOKEN_PEPPER`, `WAHA_API_KEY` on incident.

## Rate limiting

- `@nestjs/throttler` protects brute-force surfaces (login, token regeneration, baseline API traffic).
- Tune `RATE_LIMIT_SEND` via environment variables. Login uses a fixed throttle in `AuthController` (5 attempts / 15 minutes per IP).
