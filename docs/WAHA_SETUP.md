# WAHA setup



This Gateway expects a **WAHA Core** instance reachable at `WAHA_BASE_URL` (default in compose: `http://waha:3000`).



## WAHA Core + NOWEB mode (default in this repo)



- **Image:** `devlikeapro/waha:noweb` (see root [`docker-compose.yml`](../docker-compose.yml)).

- **Engine:** `WHATSAPP_DEFAULT_ENGINE=NOWEB` on the WAHA container.

- **Session name:** `WAHA_SESSION_NAME=default` on the Gateway — WAHA Core supports a single active session named `default` only.

- **Primary v1 acceptance check:** outbound **text** via `POST /api/sendText` (see [`src/waha/waha.client.ts`](../src/waha/waha.client.ts)).

- **Image/video:** the Gateway still exposes `POST /api/messages/send-media`, but delivery depends on WAHA **engine, image tag, and tier**. Do **not** treat image/video as production-supported for Core NOWEB until you run a real end-to-end test. **WAHA Plus** or a different engine may be required for some media flows.



## Docker (recommended)



See root [`docker-compose.yml`](../docker-compose.yml):



- Image: `devlikeapro/waha:noweb`

- Persistent volume on `/app/.sessions`

- `WAHA_API_KEY` on the WAHA container must match Gateway `WAHA_API_KEY` (sent as `X-Api-Key` from the Gateway client). Per WAHA docs, `WHATSAPP_API_KEY` is an accepted alias; this project uses `WAHA_API_KEY` in compose.



> **Version drift:** WAHA’s REST paths evolve. Before upgrading WAHA, open `/api/docs` on the WAHA container and verify the session, QR, and send endpoints still match [`src/waha/waha.client.ts`](../src/waha/waha.client.ts). Only that file should need edits.



## Endpoints used by the Gateway (reference)



The client currently calls:



| Method | Path | Purpose |

|--------|------|---------|

| `GET` | `/api/sessions` | Health probe |

| `POST` | `/api/sessions/start` | Start session |

| `POST` | `/api/sessions/stop` | Stop session |

| `POST` | `/api/sessions/restart` | Restart session |

| `GET` | `/api/sessions/:session` | Session status |

| `GET` | `/api/sessions/:session/auth/qr` (and fallback path) | QR (`format=image` or `format=json`) |

| `POST` | `/api/sendText` | Outbound text (`session`, `chatId`, `text`) |

| `POST` | `/api/sendImage` | Outbound image by URL (`session`, `chatId`, `file.url`, optional caption) |

| `POST` | `/api/sendVideo` | Outbound video by URL (`session`, `chatId`, `file.url`, optional caption) |



If your WAHA build uses different paths, update **`WahaClient` only**.



## Environment variables (WAHA container)



Typical keys (confirm in [WAHA docs](https://waha.devlike.pro/docs/how-to/config/) for your image tag):



- `WHATSAPP_DEFAULT_ENGINE` — `NOWEB` for this setup

- `WAHA_API_KEY` — shared secret for HTTP API (`X-Api-Key`); `WHATSAPP_API_KEY` is documented as an equivalent in WAHA



Gateway `.env` / compose (see [`.env.example`](../.env.example)):



- `WAHA_BASE_URL=http://waha:3000`

- `WAHA_SESSION_NAME=default` (required for WAHA Core)

- `WHATSAPP_DEFAULT_ENGINE=NOWEB` — documented for parity with compose; the WAHA service sets the engine explicitly in `docker-compose.yml`



## Session storage when switching engines



Moving between **WEBJS** and **NOWEB** (or upgrading engines) can leave **incompatible** session data in the WAHA volume. Symptoms: broken QR, stuck status, or auth errors.



1. `docker compose down`

2. Optionally remove **only** the WAHA session volume (not the database): `docker volume ls` then `docker volume rm <project>_waha_sessions`

3. `docker compose up --build`

4. Scan QR again



Do **not** remove the Postgres database, reset Prisma, or delete Gateway users/tokens unless there is a separate reason.



## Network security



- Do **not** publish WAHA ports to the public Internet.

- Allow only the Gateway container (or trusted admin VPN) to reach WAHA.



## Operations



- Back up the `waha_sessions` Docker volume — it contains session state required to stay logged in.

- After data loss on the volume, users must scan QR again.


