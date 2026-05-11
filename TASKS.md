# Tasks — nbos-whatsapp-gateway

Status legend: `[ ]` pending, `[~]` in progress, `[x]` done.

**v1 status:** Phases 1–8 are implemented (Nest app, Prisma, dashboard, WAHA client, send API, Docker, docs, tests).  
WAHA REST paths in [`src/waha/waha.client.ts`](src/waha/waha.client.ts) should be verified against your running WAHA version (`/api/docs`) before production traffic.

## Phase 1 — Architecture

- [x] Write `ARCHITECTURE.md`.
- [x] Write `TASKS.md`.

## Phase 2 — Foundation

- [x] `package.json`, `tsconfig.json`, `nest-cli.json`, `.eslintrc.cjs`, `.prettierrc`.
- [ ] `prisma/schema.prisma` with `User`, `WhatsappAccount`, `ApiToken`, `OutboundMessageLog`, enums.
- [ ] Initial Prisma migration.
- [ ] `prisma/seed.ts` to create the admin from env and auto-create their `WhatsappAccount`.
- [ ] `src/config/env.validation.ts` with class-validator, fail-fast.
- [ ] `PrismaModule` / `PrismaService` with shutdown hook.
- [ ] Global exception filter producing `{success:false,error:{code,message,requestId}}`.
- [ ] Request-id middleware/interceptor (`req_<ulid>`).
- [ ] Response envelope interceptor producing `{success:true,data}` for success.
- [ ] `helmet`, `cookie-parser` wiring in `main.ts`.
- [ ] argon2id password hashing helpers.
- [ ] JWT-in-httpOnly-cookie auth guard.
- [ ] CSRF double-submit cookie guard for dashboard non-GET.
- [ ] RBAC `@Roles` decorator + `RolesGuard`.
- [ ] `GET /health` endpoint (gateway, database, waha).

## Phase 3 — Users + WhatsApp accounts

- [ ] `UsersService` admin CRUD: create, list, get, update, disable, reset password.
- [ ] On user create, transactionally create `WhatsappAccount` with unique `sessionName`.
- [ ] Reject creating a second `WhatsappAccount` for same user.
- [ ] `WhatsappAccountsService`: get-by-user (self), get-by-id (admin), restart/stop, status refresh.
- [ ] Ownership guard for user-scoped routes.
- [ ] Dashboard user list page (admin), single user view (admin).
- [ ] Dashboard user "my account" page.

## Phase 4 — API tokens

- [ ] `tokens.ts` util: `generateApiToken`, `hashApiToken` (HMAC-SHA256 + `TOKEN_PEPPER`).
- [ ] `ApiTokensService`: `create`, `list`, `revoke`, `regenerate`.
- [ ] Show full token only once on create + regenerate response.
- [ ] Admin tokens page; user "my token" panel.
- [ ] `token-regen` throttler.

## Phase 5 — WAHA

- [ ] Confirm running WAHA version's API surface (`/api/docs`).
- [ ] `WahaClient` HTTP-only methods (`startSession`, `stopSession`, `restartSession`, `getQr`, `getStatus`, `sendText`, `healthCheck`).
- [ ] `WahaService` mapping WAHA status strings → `SessionStatus`.
- [ ] QR retrieval endpoint (admin / self).
- [ ] Status refresh action (admin / self).
- [ ] Status JSON endpoint for QR poller.

## Phase 6 — Send endpoint

- [ ] `ApiTokenGuard`: extract Bearer, hash, lookup, revoke check, lastUsedAt update.
- [ ] `SendMessageDto` with `forbidNonWhitelisted`, `phone` rejection, chatId regex, text length.
- [ ] `MessagesService.send`: log PENDING → call WAHA → log SENT/FAILED → return envelope.
- [ ] `send` throttler bucket per token + per IP.
- [ ] Map errors to standardized codes (`WAHA_UNAVAILABLE`, `MESSAGE_SEND_FAILED`, etc.).

## Phase 7 — Dashboard

- [ ] Handlebars view engine, layout, partials, public assets.
- [ ] `/login`, `/logout`.
- [ ] Admin: `/dashboard`, `/users`, `/users/:id`, `/accounts`, `/accounts/:id`, `/accounts/:id/qr`, `/tokens`, `/health`, `/settings`.
- [ ] User: `/me`, `/me/qr`, `/me/tokens`.
- [ ] QR vanilla-JS poller hitting `/accounts/:id/status.json` or `/me/status.json`.
- [ ] Test asserting `/chats`, `/messages`, `/groups`, `/webhooks`, `/events`, `/payloads` all 404.

## Phase 8 — Docker, docs, tests

- [ ] Multi-stage `Dockerfile`.
- [ ] `docker-compose.yml` (gateway + waha + waha_sessions volume).
- [ ] `.env.example` with every variable.
- [ ] `README.md`.
- [ ] `docs/API.md`, `docs/NBOS_INTEGRATION.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/WAHA_SETUP.md`, `docs/OPERATIONS.md`.
- [ ] Unit tests: `api-tokens.service`, `messages.service`, `waha.client`.
- [ ] E2E tests: `send`, `dashboard-access`, `users`.
- [ ] `npm run lint` clean. `npm run typecheck` clean. `npm test` green.
