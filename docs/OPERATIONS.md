# Operations runbook

## Health checks

- `GET /health` — JSON `{ success, data: { gateway, database, waha } }`.
- Dashboard admin overview shows aggregate connection stats (no message traffic metrics).

## Logs

- Use structured logs from Nest `Logger`.
- **Never** enable logging of message bodies or raw WAHA payloads in production.
- For local debugging only, introduce an explicit `DEBUG_WAHA=true` flag (off by default) if deeper traces are required.

## Common incidents

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `WHATSAPP_NOT_CONNECTED` from API | Session logged out / not scanned | Open dashboard → QR → reconnect |
| `WAHA_UNAVAILABLE` | WAHA container down / network | `docker compose ps`, restart `waha`, verify `WAHA_BASE_URL` |
| `INVALID_TOKEN` / `TOKEN_REVOKED` | Wrong or revoked API token | Regenerate token in dashboard, update NBOS env |
| `INVALID_MEDIA_URL` on `send-media` | URL not HTTPS, SSRF-blocked, or failed optional size/type check | Use a public CDN URL; see [SECURITY.md](SECURITY.md) |
| `IMAGE_SEND_FAILED` / `VIDEO_SEND_FAILED` | WAHA could not fetch or send the file | Confirm URL reachable from WAHA, format supported, size within WhatsApp limits |
| 429 responses | Rate limits | Tune `RATE_LIMIT_*`, investigate abusive client |

## Backups

- **Neon**: rely on Neon PITR / snapshots per Neon plan.
- **WAHA volume `waha_sessions`**: snapshot with your Docker volume backup tooling — required to preserve logged-in sessions.

## Restarts

```bash
docker compose restart gateway
docker compose restart waha
```

Expect brief `WAHA_UNAVAILABLE` responses while WAHA is restarting.

## WAHA engine change (e.g. WEBJS → NOWEB)

Session files under the `waha_sessions` volume may **not** be portable across engines. If QR or status misbehaves after switching to **NOWEB** (`devlikeapro/waha:noweb`, `WHATSAPP_DEFAULT_ENGINE=NOWEB`):

1. `docker compose down`
2. Remove only the WAHA volume: `docker volume rm <project>_waha_sessions` (keep the database).
3. `docker compose up --build` and scan QR again.

See [WAHA_SETUP.md](WAHA_SETUP.md) for the canonical NOWEB + Core `default` session notes.


## Database migrations

```bash
npx prisma migrate deploy
```

Run against production `DATABASE_URL` from CI or a secure admin shell.

## Security rotations

Rotate in order:

1. Issue new `WAHA_API_KEY`, restart WAHA + Gateway with updated env.
2. Regenerate compromised API tokens in dashboard.
3. If dashboard session cookies might be leaked: rotate `JWT_SECRET` + `COOKIE_SECRET` (invalidates all web sessions).
