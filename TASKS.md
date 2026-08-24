# Tasks — nbos-whatsapp-gateway

Status legend: `[ ]` pending, `[~]` in progress, `[x]` done, `[obsolete]` superseded — do not implement.

**v1 status:** Nest app, Prisma, Admin dashboard, WAHA client, send/media/group API, Docker, docs, and tests are in place.
WAHA REST paths in [`src/waha/waha.client.ts`](src/waha/waha.client.ts) should be verified against your running WAHA version (`/api/docs`) before production traffic.

## Current ownership (Phase 1)

- [x] Singleton `Admin` (`singleton = 1`, no User model, no Role enum, no `ADMIN_NAME`).
- [x] `Project` owns `ApiToken[]` and `WhatsappAccount[]` (`mode`: `SEND_ONLY` | `MESSENGER`).
- [x] Project FKs use `ON DELETE RESTRICT` (no cascade project delete; no audited delete workflow).
- [x] Dashboard: `/dashboard`, `/projects`, `/projects/:id/accounts/:accountId` (QR/restart/stop/unlink/activate/deactivate), `/system`.
- [x] Token reveal: signed httpOnly `gw_token_reveal`, project-bound, consume-once, never in URLs/logs.
- [x] Session: signed `gw_session` only (unsigned cookie fallback removed).
- [x] Legacy API: token → Project → exactly one active account, or `PROJECT_HAS_NO_ACTIVE_ACCOUNT` / `PROJECT_ACCOUNT_AMBIGUOUS`.
- [x] Message/media/group loaders query by account id **and** `projectId`.
- [x] Seed upserts Admin only; verifies Argon2 before rehash; bumps `sessionVersion` only when credentials change.
- [x] `MESSENGER` is selectable in the UI with a Phase 1 “stored only, not enabled” notice.
- [x] Destructive migration `20260824120000_phase1_admin_project_ownership` is **test/disposable-only**.
- [x] Rate limiting is IP-based (`@nestjs/throttler`); `RATE_LIMIT_SEND` is not a per-token bucket.

### Obsolete (replaced by Admin + Project)

- [obsolete] `User` / `Role` / `UsersService` / `RolesGuard` / `@Roles`.
- [obsolete] Dashboard `/users`, `/me`, `/tokens`, `/accounts`, `/settings`.
- [obsolete] One user → one WhatsApp account; tokens bound to an account.
- [obsolete] Seed `ADMIN_NAME` and auto-create a WhatsApp account for the admin.

## Phase 1 — Architecture

- [x] Write `ARCHITECTURE.md`.
- [x] Write `TASKS.md`.

## Phase 2 — Foundation

- [x] `package.json`, `tsconfig.json`, `nest-cli.json`, `.eslintrc.cjs`, `.prettierrc`.
- [x] `prisma/schema.prisma` with `Admin`, `Project`, `WhatsappAccount`, `ApiToken`, `OutboundMessageLog`, enums.
- [x] Prisma migrations (init + later ops + Phase 1 ownership).
- [x] `prisma/seed.ts` upserts singleton Admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- [x] `src/config/env.validation.ts` with class-validator, fail-fast.
- [x] `PrismaModule` / `PrismaService` with shutdown hook.
- [x] Global exception filter producing `{success:false,error:{code,message,requestId}}`.
- [x] Request-id middleware/interceptor (`req_<ulid>`).
- [x] Response envelope interceptor producing `{success:true,data}` for success.
- [x] `helmet`, `cookie-parser` wiring in `main.ts`.
- [x] argon2id password hashing helpers.
- [x] JWT in signed httpOnly `gw_session` cookie; guard reloads Admin from DB.
- [x] CSRF double-submit cookie guard for dashboard non-GET.
- [obsolete] RBAC `@Roles` decorator + `RolesGuard`.
- [x] `GET /health` endpoint (gateway, database, waha).

## Phase 3 — Projects + WhatsApp accounts

- [x] `ProjectsService` Admin CRUD: create, list, get, update, activate/deactivate.
- [x] `WhatsappAccountsService`: create/list/get for a Project, restart/stop/unlink, status refresh, activate/deactivate.
- [x] Project-scoped lookup (cross-project access fails closed).
- [x] Dashboard project list/detail, nested account pages, QR.
- [obsolete] User CRUD and “my account” pages.

## Phase 4 — API tokens

- [x] `tokens.ts` util: `generateApiToken`, `hashApiToken` (HMAC-SHA256 + `TOKEN_PEPPER`).
- [x] `ApiTokensService`: `create`, `listForProject`, `revoke`, `regenerate`.
- [x] Show full token only once (project-bound signed cookie).
- [x] Project detail token panel.
- [x] `token-regen` throttler (per IP).

## Phase 5 — WAHA

- [x] `WahaClient` HTTP-only methods (`startSession`, `stopSession`, `restartSession`, `getQr`, `getStatus`, `sendText`, `healthCheck`, media/groups).
- [x] `WahaService` mapping WAHA status strings → `SessionStatus`.
- [x] QR retrieval and status refresh on project account routes.
- [ ] Confirm running WAHA version's API surface (`/api/docs`) on each deploy.

## Phase 6 — Send endpoint

- [x] `ApiTokenGuard`: extract Bearer, hash, lookup, revoke/project/active-account checks, lastUsedAt update.
- [x] `SendMessageDto` with `forbidNonWhitelisted`, `phone` rejection, chatId regex, text length.
- [x] `MessagesService.send`: log PENDING → call WAHA → log SENT/FAILED → return envelope.
- [x] IP-based throttler (`RATE_LIMIT_SEND`); not per-token.
- [x] Map errors to standardized codes (`WAHA_UNAVAILABLE`, `MESSAGE_SEND_FAILED`, etc.).

## Phase 7 — Dashboard

- [x] Handlebars view engine, layout, partials, public assets.
- [x] `/login`, `/logout`.
- [x] Admin: `/dashboard`, `/projects`, `/projects/:id`, nested accounts + QR, `/system`.
- [obsolete] `/users`, `/me`, standalone `/accounts`, `/tokens`, `/settings`.
- [x] QR poller on account QR page.
- [x] Tests asserting `/chats`, `/messages`, `/groups`, `/webhooks`, `/events`, `/payloads` return 404.

## Phase 8 — Docker, docs, tests

- [x] Multi-stage `Dockerfile`.
- [x] `docker-compose.yml` (gateway + waha + waha_sessions volume).
- [x] `.env.example` with every variable.
- [x] `README.md`.
- [x] `docs/API.md`, `docs/NBOS_INTEGRATION.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/WAHA_SETUP.md`, `docs/OPERATIONS.md`.
- [x] Unit tests: tokens, messages, accounts, projects, auth, token reveal, loaders.
- [x] E2E tests: send, send-media, groups, dashboard-access, dashboard projects/tokens/CSRF/reveal.
- [x] `npm run typecheck` / `npm test` / `npm run test:e2e` expected green. Windows checkout may still fail Prettier `endOfLine: lf`.
