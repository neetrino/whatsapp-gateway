# Security model

## API tokens

- Raw tokens are shown **exactly once** after create/regenerate in the dashboard via a short-lived **signed httpOnly** cookie `gw_token_reveal` (2 minutes, `Secure` in production, consume-once). The payload is bound to the **issuing Project**; Project A’s token is never rendered on Project B, and a mismatch does not consume the cookie. Never put raw tokens in URLs (`?revealed=`), logs, or query strings.
- Database stores **`tokenHash` only** (HMAC-SHA256 with `TOKEN_PEPPER`), plus `tokenPrefix` and `last4` for display.
- `TOKEN_PEPPER` must be high-entropy (≥ 32 chars) and treated like a root secret.
- Revoked tokens fail closed with `TOKEN_REVOKED`.
- Send traffic is rate-limited **per token hash** when `Authorization: Bearer` is present (HMAC-SHA256 with `TOKEN_PEPPER`), otherwise **per client IP**. Raw tokens are never used as keys. v1 send and v1 read use named throttlers `RATE_LIMIT_V1_SEND` / `RATE_LIMIT_V1_READ` only (not also `RATE_LIMIT_SEND`). Legacy traffic uses `RATE_LIMIT_SEND`. In-process storage is bounded; counters are **not** shared across replicas.

## Dashboard authentication

- Passwords hashed with **argon2id** (`argon2` package).
- Session JWT is read **only** from the **signed** `gw_session` cookie (`COOKIE_SECRET`). Unsigned `gw_session` cookies are ignored. Cookie is httpOnly, SameSite=Lax; `Secure` only when `NODE_ENV=production`. Use `NODE_ENV=development` for local `http://localhost` (including Docker Compose with `.env`). Never `localStorage`.
- **CSRF**: double-submit cookie (`gw_csrf`) verified on all non-GET dashboard mutations.
- **Identity**: singleton Admin (unique `singleton = 1`). There is no User model, Role enum, or `ADMIN_NAME`. API tokens and WhatsApp accounts belong to a Project (`ON DELETE RESTRICT`). Inactive projects cannot authorize API calls.

## WAHA isolation

- WAHA must **not** be exposed publicly without VPN / IP allowlist / strong auth.
- Prefer Docker **internal DNS** only (`http://waha:3000` from Gateway).
- Set `WAHA_API_KEY` and configure WAHA to require it (see [WAHA_SETUP.md](WAHA_SETUP.md)).

## Privacy / data minimization

- **No message text** in `OutboundMessageLog`, `OutboundMessageIdempotency`, or UI.
- **No `mediaUrl`, captions, or media binaries** in the database. Logs may record safe metadata only (e.g. `messageType`, `chatId`, status, ids, errors, request hash).
- **No webhook log UI**, no raw payload storage by default.
- Structured logs must **not** include message bodies, full API tokens, passwords, or raw WAHA message payloads.

## SSRF protection (`send-media`)

External callers supply `mediaUrl`; WAHA fetches it. To prevent the Gateway from accepting URLs that point at internal services (even though WAHA performs the fetch), the Gateway validates every `mediaUrl` with `validatePublicHttpsUrl` in `src/common/utils/public-url.ts`:

- **HTTPS only**; no `http://`, `file://`, or credentials in the userinfo.
- Blocks **localhost**, **`.local`**, **`host.docker.internal`**, **private IPv4/IPv6 ranges** (including CGNAT `100.64.0.0/10`), **link-local**, and **loopback** literals.
- For non-literal hostnames, **DNS resolution**; if any resolved address is private, the URL is rejected.

Optional **`HEAD`** checks (no body download) may enforce `Content-Type` and max size (`MAX_IMAGE_SIZE_MB`, `MAX_VIDEO_SIZE_MB`). Tune limits via environment variables; see [`.env.example`](../.env.example).

## Webhooks

### WAHA → Gateway (`POST /internal/waha/events`)

- Internal-only route (Docker network / `GATEWAY_INTERNAL_URL`). Not throttled by `RATE_LIMIT_SEND` (`@SkipThrottle()` + default throttler `skipIf`).
- Verifies `X-Webhook-Hmac` / `X-Webhook-Hmac-Algorithm: sha512` on the **raw body** using `WAHA_WEBHOOK_SECRET`.
- Rejects stale `X-Webhook-Timestamp` (±5 minutes).
- Unknown WAHA sessions return **200** (no retry storm); events are logged and dropped.
- `SEND_ONLY` accounts are ignored (200 to WAHA, no Project delivery).
- Gateway returns **200 to WAHA after enqueue** into `project_webhook_deliveries` (durable queue). A process crash after 200 but before Project 2xx may lose in-flight worker attempts; the row survives and the in-process worker retries via `nextAttemptAt`.

### Gateway → Project (HTTPS webhook)

- Per-Project `webhookUrl` + hashed signing key (`webhookSecretHash`, `webhookSecretPrefix`, `webhookSecretLast4`). Plaintext secrets are **never** stored.
- Signing key is generated in the Admin dashboard (**Regenerate signing key**). Shown **once** via signed httpOnly cookie `gw_webhook_reveal` (2 minutes, project-bound, consume-once) — same pattern as API tokens (`gw_token_reveal`). Never in URLs.
- Outbound headers: `X-Gateway-Event-Id`, `X-Gateway-Timestamp`, `X-Gateway-Signature`, `X-Gateway-Signature-Algorithm: sha512`.
- Signature: HMAC-SHA512 over **`${timestamp}.${rawJsonBody}`** (timestamp is the `X-Gateway-Timestamp` header value). Projects must reject stale timestamps (recommended ±5 minutes).
- Payload is normalized JSON (no raw WAHA). Stored in Postgres as `payloadJson` + `payloadHash` for retries.
- **SSRF:** `validatePublicHttpsUrl` runs on save **and before every delivery attempt**; axios `maxRedirects: 0`. Blocks `gateway`, `waha`, `metadata`, private IPs, etc.
- Delivery statuses: `PENDING`, `DELIVERED`, `FAILED`, `EXHAUSTED`, `SKIPPED`. Unique `(projectId, eventId)`.
- Dashboard shows delivery counts/recent metadata only — not payload bodies.

## Environment secrets

- Validate all required env vars at boot (`class-validator` on `process.env`).
- Never commit `.env`. Rotate `JWT_SECRET`, `COOKIE_SECRET`, `TOKEN_PEPPER`, `WAHA_API_KEY` on incident.

## Rate limiting

- `@nestjs/throttler` named throttlers: `default` / `v1-send` / `v1-read`. Skip-if ensures **one** limiter per request. `POST /internal/waha/events` is excluded from all throttlers.
- Tracker: `token:<hmac>` when a Bearer token is present, else `ip:<req.ip>`.
- `app.set('trust proxy', 1)` in `main.ts` trusts the first reverse-proxy hop (`X-Forwarded-For`). Configure the proxy to overwrite (not append blindly) that header. Clients behind the same NAT share the IP bucket when they omit a token.
- `RATE_LIMIT_SEND` — legacy API + dashboard baseline / 60s (not applied to `/api/v1`).
- `RATE_LIMIT_V1_SEND` — `POST /api/v1/accounts/:id/messages` / 60s.
- `RATE_LIMIT_V1_READ` — `GET /api/v1/accounts` and status / 60s.
- In-memory buckets expire after the window and are capped (`BoundedThrottlerStorage`, max 10_000 keys). Invalid-token abuse cannot retain keys indefinitely. Multi-instance deployments need Redis (not implemented).
- Login uses a fixed throttle in `AuthController` (5 attempts / 15 minutes per IP). Token create/regenerate is 3 / hour per IP.
- Exhausted budgets return `429 RATE_LIMITED`.
