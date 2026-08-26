# WAHA setup

This Gateway expects a **pinned WAHA NOWEB** instance at `WAHA_BASE_URL` (compose: `http://waha:3000`). WAHA stays on the Docker internal network and must not be published.

## Pinned image (Phase 2)

- **Image:** `devlikeapro/waha:noweb-2026.8.1` (see root [`docker-compose.yml`](../docker-compose.yml)). Do not float on `:noweb` or `:latest`.
- **Engine:** `WHATSAPP_DEFAULT_ENGINE=NOWEB`.
- **Sessions:** Core includes multi-session after the Plus merge (June 2026). Each Gateway `WhatsappAccount.sessionName` is an independent WAHA session (`wa_<hex>`).
- **`WAHA_SESSION_NAME`:** deprecated and **ignored**. The database name is authoritative.
- **Existing Core `default` sessions:** if a volume still holds a single `default` session from Phase 1, that WhatsApp login will not automatically attach to a `wa_*` database name. Re-scan QR per account after upgrade. Do **not** delete the `waha_sessions` volume without an explicit operator decision.

## Multi-session verification

Do **not** claim two-session readiness until this live check passes. Production compose keeps WAHA on `expose` only. For tests, merge the loopback overlay (binds `127.0.0.1:3001`, never `0.0.0.0`):

```bash
docker compose -f docker-compose.yml -f docker-compose.integration.yml up -d waha
WAHA_BASE_URL=http://127.0.0.1:3001 WAHA_INTEGRATION=1 npm run test:waha
```

Do not use Gateway port `3000` as `WAHA_BASE_URL`. The test fails fast if the target is Gateway, rejects “only default session” 422, requires two named sessions with GET status 200, and deletes the test sessions on cleanup.

The test creates two named sessions, reads independent status, and probes `GET /api/{session}/auth/qr?format=json`. Sending a real WhatsApp message still requires a scanned session.

Manual:

1. `POST /api/sessions` with `{ "name": "wa_a" }` and `{ "name": "wa_b" }`.
2. `POST /api/sessions/{name}/start` for each.
3. `GET /api/sessions/wa_a` and `GET /api/sessions/wa_b` — distinct records.
4. QR: `GET /api/{session}/auth/qr`.
5. After scan, send via Gateway v1 using each `accountId` and confirm WAHA logs/session name match.

If a given image returns 422 “only default session”, stop: that edition cannot support Phase 2. Options: use `noweb-2026.8.1` (or later Core with the Plus merge), or a licensed Plus image. Do not fake multi-session with `WAHA_SESSION_NAME=default`.

## Docker (recommended)

See root [`docker-compose.yml`](../docker-compose.yml):

- Image: `devlikeapro/waha:noweb-2026.8.1`
- Persistent volume on `/app/.sessions`
- `WAHA_API_KEY` on the WAHA container must match Gateway `WAHA_API_KEY` (`X-Api-Key`). `WHATSAPP_API_KEY` is an accepted WAHA alias; this project uses `WAHA_API_KEY`.
- WAHA has **no** `ports:` mapping — only `expose: "3000"` on the internal network.

> **Version drift:** Before upgrading WAHA, open `/api/docs` on the WAHA container and verify session, QR, and send endpoints still match [`src/waha/waha.client.ts`](../src/waha/waha.client.ts).

## Endpoints used by the Gateway (reference)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/sessions` | Health probe |
| `POST` | `/api/sessions` | Create named session |
| `POST` | `/api/sessions/:session/start` | Start session |
| `POST` | `/api/sessions/stop` | Stop session |
| `POST` | `/api/sessions/restart` | Restart session |
| `GET` | `/api/sessions/:session` | Session status |
| `GET` | `/api/{session}/auth/qr` | QR (`format=image` or `format=json`) |
| `POST` | `/api/sendText` | Outbound text (`session`, `chatId`, `text`) |
| `POST` | `/api/sendImage` | Outbound image by URL |
| `POST` | `/api/sendVideo` | Outbound video by URL |
| `GET` | `/api/{session}/groups` | List groups |
| `POST` | `/api/{session}/groups` | Create group |
| `GET` | `/api/{session}/groups/{groupId}` | Get group |
| `POST` | `/api/{session}/groups/refresh` | Refresh groups cache |
| `GET` | `/api/{session}/groups/{groupId}/participants/v2` | Participants (fallback: `/participants`) |
| `POST` | `/api/{session}/groups/{groupId}/participants/add` | Add participants |
| `GET` | `/api/{session}/groups/{groupId}/invite-code` | Invite code |

If your WAHA build uses different paths, update **`WahaClient` only**.

## Environment variables (WAHA container)

- `WHATSAPP_DEFAULT_ENGINE=NOWEB`
- `WAHA_API_KEY` — shared secret (`X-Api-Key`)

Gateway `.env` / compose (see [`.env.example`](../.env.example)):

- `WAHA_BASE_URL=http://waha:3000`
- Do not set `WAHA_SESSION_NAME` (ignored if present)

## Session storage when switching engines

Moving between **WEBJS** and **NOWEB** (or upgrading engines) can leave **incompatible** session data in the WAHA volume. Symptoms: broken QR, stuck status, or auth errors.

1. `docker compose down`
2. Optionally remove **only** the WAHA session volume after explicit confirmation: `docker volume ls` then `docker volume rm <project>_waha_sessions`
3. `docker compose up --build`
4. Scan QR again for each account

Do **not** remove the Postgres database, reset Prisma, or delete Gateway Admin/projects/tokens unless there is a separate reason.

## Network security

- Do **not** publish WAHA ports to the public Internet.
- Allow only the Gateway container (or trusted admin VPN) to reach WAHA.

## Operations

- Back up the `waha_sessions` Docker volume — it contains session state required to stay logged in.
- After data loss on the volume, users must scan QR again.
