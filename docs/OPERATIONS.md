# Operations runbook

## Health checks

- `GET /health` — JSON `{ success, data: { gateway, database, waha } }`. **Not rate-limited** (`@SkipThrottle()`).
- Dashboard admin overview shows aggregate connection stats (no message traffic metrics).

## Single Gateway instance (Phase 4 honesty)

The Gateway process is designed for **one replica** per deployment:

- **Rate limits** use in-process `BoundedThrottlerStorage` (not shared across pods/VMs).
- **Project webhook delivery** uses an in-process worker (`setInterval` + `nextAttemptAt`). Multiple replicas would split retries and can **double-deliver** the same `(projectId, eventId)` if both workers run.

Phase 4 does **not** add Redis or a distributed queue. Scale vertically or accept duplicate webhook POST risk until a future phase adds shared infrastructure.

## Logs

- Use structured logs from Nest `Logger`.
- **Never** enable logging of message bodies or raw WAHA payloads in production.
- For local debugging only, introduce an explicit `DEBUG_WAHA=true` flag (off by default) if deeper traces are required.

## Common incidents

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `WHATSAPP_NOT_CONNECTED` from API | Session logged out / not scanned | Pair via `GET /api/v1/accounts/:id/qr` in the integrating app, or dashboard → QR. To force a new scan: `POST .../session/logout` then fetch QR again |
| `WAHA_UNAVAILABLE` | WAHA container down / network | `docker compose ps`, restart `waha`, verify `WAHA_BASE_URL` |
| `INVALID_TOKEN` / `TOKEN_REVOKED` | Wrong or revoked API token | Regenerate token in dashboard, update NBOS env |
| `INVALID_MEDIA_URL` on `send-media` | URL not HTTPS, SSRF-blocked, or failed optional size/type check | Use a public CDN URL; see [SECURITY.md](SECURITY.md) |
| `IMAGE_SEND_FAILED` / `VIDEO_SEND_FAILED` | WAHA could not fetch or send the file | Confirm URL reachable from WAHA, format supported, size within WhatsApp limits |
| `ACCOUNT_MODE_NOT_SUPPORTED` | v1 chats/history or inbound on `SEND_ONLY` | Switch account to **MESSENGER** in dashboard (CSRF-protected), then **Restart** session |
| `STORE_NOT_READY` | NOWEB Store not warmed / session not restarted after deploy | **Restart** MESSENGER account (or switch-mode) so WAHA PUT applies Store + webhooks; wait for CONNECTED |
| `MESSAGE_OUTCOME_UNKNOWN` | Prior send idempotency row stuck or DB/WAHA outcome unclear | Do **not** retry with a new idempotency key; reconcile manually via logs + WAHA |
| Project webhook `EXHAUSTED` | Project endpoint failed all retry attempts | Fix Project HTTPS endpoint; check delivery stats in dashboard; replay from source if needed |
| WAHA inbound **401** / HMAC errors | `WAHA_WEBHOOK_SECRET` mismatch or stale timestamp | Align secret on Gateway + WAHA session config; ensure NTP/time sync |
| 429 on API (not health) | Rate limits | Tune `RATE_LIMIT_*`, investigate abusive client |
| Inbound events missing after deploy | Old MESSENGER sessions lack webhook config | **Restart** each MESSENGER account (do **not** logout; do **not** wipe `waha_sessions`) |

### After Gateway deploy (MESSENGER accounts)

Existing MESSENGER sessions do **not** automatically pick up Store + webhook config. For each MESSENGER account:

1. Dashboard → account → **Restart** (or deactivate/reactivate + switch mode).
2. Confirm WAHA session PUT includes Store + `POST {GATEWAY_INTERNAL_URL}/internal/waha/events` webhooks (HMAC sha512).
3. Smoke: send inbound WhatsApp message → Project webhook receives normalized `message.received`.

## Backups

- **Neon**: rely on Neon PITR / snapshots per Neon plan.
- **WAHA volume `waha_sessions`**: snapshot with your Docker volume backup tooling — required to preserve logged-in sessions. **Do not delete** `whatsapp-gateway_waha_sessions` in production.

## Restarts

```bash
docker compose restart gateway
docker compose restart waha
```

Expect brief `WAHA_UNAVAILABLE` responses while WAHA is restarting.

## WAHA engine change (e.g. WEBJS → NOWEB)

Session files under the `waha_sessions` volume may **not** be portable across engines. If QR or status misbehaves after switching to **NOWEB** (`devlikeapro/waha:noweb-2026.8.1`, `WHATSAPP_DEFAULT_ENGINE=NOWEB`):

1. `docker compose down`
2. Remove only the WAHA volume: `docker volume rm <project>_waha_sessions` (keep the database).
3. `docker compose up --build` and scan QR again.

See [WAHA_SETUP.md](WAHA_SETUP.md) for the pinned multi-session image and integration-only loopback overlay.

## Database migrations

```bash
npx prisma migrate deploy
```

Run against production `DATABASE_URL` from CI or a secure admin shell.

**Order / warnings:**

1. **Never** run `20260824120000_phase1_admin_project_ownership` on production data you need to keep (destructive).
2. Apply additive migrations in timestamp order on Neon (`phase2_*`, `phase3_webhook_delivery`, …).
3. `20260716120000_multi_whatsapp_per_user` is in the tree (from `main`, SQL unchanged). Prod DBs that already applied it are fine. DBs that ran Phase 1 without that row: `prisma migrate resolve --applied 20260716120000_multi_whatsapp_per_user`.

## Security rotations

Rotate in order:

1. Issue new `WAHA_API_KEY`, restart WAHA + Gateway with updated env.
2. Regenerate compromised API tokens in dashboard.
3. Regenerate Project webhook signing keys if Project endpoint or DB hash may be leaked (DB leak allows forging outbound webhooks — see [SECURITY.md](SECURITY.md)).
4. If dashboard session cookies might be leaked: rotate `JWT_SECRET` + `COOKIE_SECRET` (invalidates all web sessions).

## Production cutover checklist

Use this before pointing NBOS/production traffic at a new Gateway deployment. **Do not execute blindly on prod without a maintenance window.**

### Pre-cutover

- [ ] Neon backup / PITR confirmed for target project.
- [ ] Docker volume backup of `waha_sessions` (or accept QR re-scan plan).
- [ ] `.env` reviewed: `GATEWAY_PUBLIC_URL`, `GATEWAY_INTERNAL_URL=http://gateway:3000` (compose service names **`gateway`** + **`waha`**), `WAHA_WEBHOOK_SECRET` ≥ 32 chars, `WEBHOOK_*` timeouts/retries, `TOKEN_PEPPER` / cookie secrets ≥ 32 chars.
- [ ] WAHA image pinned: `devlikeapro/waha:noweb-2026.8.1`.
- [ ] Migration plan: `npx prisma migrate deploy` on disposable DB first; **skip** destructive Phase 1 migration on prod data.
- [ ] `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build` green in CI.

### Deploy

- [ ] Pull/build Gateway image; `docker compose up -d` (`gateway` + `waha`).
- [ ] `npx prisma migrate deploy` against production Neon (additive only).
- [ ] `npm run prisma:seed` if Admin missing (disposable password in env — change after login).
- [ ] `GET /health` → database + waha OK.

### Post-deploy smoke

- [ ] Admin login → create/verify Project.
- [ ] **MESSENGER** account: **Restart** (attaches Store + inbound webhooks without logout).
- [ ] v1 `POST .../messages` with `Idempotency-Key` (SEND_ONLY or MESSENGER).
- [ ] v1 `GET .../chats` on MESSENGER account (expect data or `STORE_NOT_READY` → restart again).
- [ ] Dashboard → Project webhook → **Regenerate signing key** → save hex key once → enable webhook URL.
- [ ] Inbound message → Project endpoint 2xx + HMAC verify.
- [ ] Optional live WAHA: `docker compose -f docker-compose.yml -f docker-compose.integration.yml up -d waha` then `WAHA_INTEGRATION=1 npm run test:waha` — **not run** if Docker WAHA unavailable.

### Rollback

- [ ] Redeploy **previous Gateway image** tag/digest.
- [ ] Do **not** blindly reverse additive SQL migrations on Neon — forward-fix preferred.
- [ ] If Gateway rollback breaks webhook config, **Restart** MESSENGER sessions after Gateway is healthy again.
- [ ] Keep `waha_sessions` volume unless engine corruption requires wipe (last resort → QR re-scan).
