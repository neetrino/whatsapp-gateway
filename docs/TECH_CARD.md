# WhatsApp Gateway — technical card

> Recorded after the fact: this service already exists. Do not treat blank template defaults as the stack.
> **Status.** approved (baseline for ongoing work)

**Project.** nbos-whatsapp-gateway  
**Size.** A (small)  
**Date.** 2026-08-30

> Statuses: ⬜ not started · 🔄 in progress · ✅ done · ➖ not required

---

## 1. Foundation

| # | Parameter | Decision | Status | Note |
|---|-----------|----------|--------|------|
| 1.1 | Project size | A | ✅ | Standalone NestJS service, focused feature set |
| 1.2 | Architecture | Simple modular NestJS | ✅ | `src/<domain>`, not feature-folders, not monorepo. Canon: [`ARCHITECTURE.md`](../ARCHITECTURE.md) |
| 1.3 | Package manager | npm | ✅ | CI uses `npm ci`. `pnpm-lock.yaml` is leftover, not the install path |
| 1.4 | Node.js | 20.x | ✅ | `engines.node >= 20`; CI Node 20 |
| 1.5 | TypeScript | 5.7, `strict: true` | ✅ | `tsconfig.json` |
| 1.6 | Monorepo tool | — | ➖ | Size A |
| 1.7 | Git strategy | Feature branches | ✅ | |
| 1.8 | Commit convention | Conventional Commits | ✅ | `.commitlintrc.json` from Rules-Template |

---

## 2. Frontend

| # | Parameter | Decision | Status | Note |
|---|-----------|----------|--------|------|
| 2.1 | Framework | Handlebars SSR | ✅ | Express Handlebars dashboard. No Next.js, no SPA |
| 2.2 | Styles | Server-rendered templates | ✅ | No Tailwind / shadcn |
| 2.3 | UI Kit | Custom Handlebars views | ✅ | `src/dashboard/views/` |
| 2.4–2.11 | SPA / i18n / SEO / PWA / dark theme | — | ➖ | Not a public marketing or app UI |

---

## 3. Backend

| # | Parameter | Decision | Status | Note |
|---|-----------|----------|--------|------|
| 3.1 | Type | NestJS 10.x | ✅ | Single process: API + dashboard |
| 3.2 | Validation | class-validator + class-transformer | ✅ | Fail-fast env in `src/config/env.validation.ts` |
| 3.3 | API format | REST JSON | ✅ | Envelope `{ success, data, error }`. Public contract: [`docs/API.md`](API.md) |
| 3.4 | Rate limiting | `@nestjs/throttler` + in-process `BoundedThrottlerStorage` | ✅ | Per token hash or IP. One replica only — see [`docs/OPERATIONS.md`](OPERATIONS.md) |
| 3.5 | API docs | Markdown | ✅ | `docs/API.md` / `docs/INTEGRATION.md`. No Swagger |
| 3.6 | CRON / scheduler | In-process only | ✅ | Idempotency cleanup + webhook fanout worker. Not Redis/BullMQ |
| 3.7 | File upload | — | ➖ | Media send uses public HTTPS `mediaUrl`; Gateway does not store files |

---

## 4. Database

| # | Parameter | Decision | Status | Note |
|---|-----------|----------|--------|------|
| 4.1 | DBMS | SQLite | ✅ | Docker volume `gateway_data` → `/app/data/gateway.db`. **Not Neon / Postgres** |
| 4.2 | ORM | Prisma 5.x | ✅ | `prisma/schema.prisma` |
| 4.3 | DB roles | — | ➖ | File SQLite, single process |
| 4.4–4.7 | Postgres timeouts / connection limits | — | ➖ | SQLite |
| 4.8 | Seed | `prisma/seed.ts` + bootstrap admin from env | ✅ | Admin upserted on start from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| 4.9 | Cache (Redis) | — | ➖ | Explicitly out of scope (Phase 4) |
| 4.10 | Queues | — | ➖ | In-process webhook worker only |
| 4.11 | Production migrations | `prisma migrate deploy` in Docker entrypoint | ✅ | Do not run production migrations from a laptop |

---

## 5. Identity

| # | Parameter | Decision | Status | Note |
|---|-----------|----------|--------|------|
| 5.1 | Solution | Custom NestJS auth | ✅ | Not Auth.js / Clerk |
| 5.2 | Providers | Email + password (singleton Admin) | ✅ | No OAuth |
| 5.3 | Session | JWT in signed httpOnly cookie `gw_session` | ✅ | Revalidated from DB `sessionVersion` |
| 5.4 | Roles / RBAC | — | ➖ | One Admin. Tokens and accounts belong to a Project, not a User |
| 5.5 | Email verification | — | ➖ | |
| 5.6 | Password reset | — | ➖ | Rotate via `ADMIN_EMAIL` / `ADMIN_PASSWORD` on start |

---

## 6. Storage and CDN

| # | Parameter | Decision | Status | Note |
|---|-----------|----------|--------|------|
| 6.1 | File storage | — | ➖ | No R2. No message/media persistence |
| 6.2 | CDN | — | ➖ | Callers host their own public media URLs |
| 6.3 | Image optimization | — | ➖ | |

---

## 7. External services

| # | Parameter | Decision | Status | Note |
|---|-----------|----------|--------|------|
| 7.1 | Email | — | ➖ | |
| 7.2 | Payments | — | ➖ | |
| 7.3 | Analytics | — | ➖ | |
| 7.4 | Error tracking | — | ➖ | |
| 7.5–7.10 | Search / push / SMS / AI / CMS / maps | — | ➖ | |
| 7.11 | WhatsApp engine | WAHA `devlikeapro/waha:noweb-2026.8.1` | ✅ | Internal Docker only. Boundary: `src/waha/*` |

---

## 8. DevOps and hosting

| # | Parameter | Decision | Status | Note |
|---|-----------|----------|--------|------|
| 8.1 | Frontend hosting | Same process as API | ✅ | Handlebars on Nest |
| 8.2 | Backend hosting | Hetzner + Docker Compose | ✅ | [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) |
| 8.3 | CI/CD | GitHub Actions | ✅ | `.github/workflows/ci.yml` + SSH deploy on `main` |
| 8.4 | Docker | Dockerfile + compose (gateway + waha) | ✅ | Public ingress: Gateway only |
| 8.5 | WAF | Reverse proxy / operator choice | ➖ | Terminate TLS in front of `localhost:3000` |
| 8.6 | Monitoring | `GET /health` | ✅ | `{ gateway, database, waha }` |
| 8.7 | Logging | Nest `Logger` | ✅ | No message bodies / raw WAHA payloads |
| 8.8 | Environments | local + production | ✅ | |
| 8.9 | Domain | Custom HTTPS `APP_URL` | ✅ | |
| 8.10 | DB backups | SQLite volume + runbook | ✅ | [`docs/OPERATIONS.md`](OPERATIONS.md). Do not delete `gateway_data` or `waha_sessions` |
| 8.11 | Migration job | Docker entrypoint `prisma migrate deploy` | ✅ | |

---

## 9. Testing

| # | Parameter | Decision | Status | Note |
|---|-----------|----------|--------|------|
| 9.1 | Unit tests | Jest | ✅ | `npm test` |
| 9.2 | Component tests | — | ➖ | No React |
| 9.3 | E2E tests | Jest + Supertest | ✅ | `npm run test:e2e` |
| 9.4 | Coverage target | Adaptive | 🔄 | |
| 9.5 | API tests | Supertest in e2e | ✅ | Optional live WAHA: `npm run test:waha` |

---

## 10. Security (required)

| # | Parameter | Status | Note |
|---|-----------|--------|------|
| 10.1 | CORS | ✅ | Dashboard + JSON API; see [`docs/SECURITY.md`](SECURITY.md) |
| 10.2 | CSRF | ✅ | Double-submit `gw_csrf` on dashboard mutations |
| 10.3 | Helmet | ✅ | `@nestjs` + `helmet` |
| 10.4 | Input validation | ✅ | class-validator DTOs; env fail-fast |
| 10.5 | argon2 for passwords | ✅ | argon2id. API tokens: HMAC-SHA256 + `TOKEN_PEPPER` |
| 10.6 | Rate limiting | ✅ | Named throttlers; health is `@SkipThrottle()` |
| 10.7 | Secrets in env only | ✅ | `.env` gitignored; `.env.example` documents names only |

---

## 11. Project documentation

| # | Document | Status | Note |
|---|----------|--------|------|
| 11.1 | docs/BRIEF.md | ➖ | Product brief lives in `README.md` + `ARCHITECTURE.md` |
| 11.2 | docs/TECH_CARD.md | ✅ | This file |
| 11.3 | Architecture | ✅ | Root [`ARCHITECTURE.md`](../ARCHITECTURE.md) (not `docs/01-ARCHITECTURE.md`) |
| 11.4 | docs/PROGRESS.md | ➖ | Work tracking: `TASKS.md` |
| 11.5 | README.md | ✅ | |
| 11.6 | .env.example | ✅ | |

Product docs also include `docs/API.md`, `docs/INTEGRATION.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/WAHA_SETUP.md`, `docs/OPERATIONS.md`.

---

## 12. Close-out checks

Filled as a living snapshot, not a greenfield gate.

### Code and quality

| # | Check | Status |
|---|-------|--------|
| 12.1 | TypeScript: 0 errors | 🔄 | CI `typecheck` |
| 12.2 | ESLint | 🔄 | `npm run lint` |
| 12.3 | Build succeeds | ✅ | CI `npm run build` |
| 12.4 | Tests pass | ✅ | CI unit + e2e |
| 12.5 | No `console.log` in production paths | 🔄 | Use Nest Logger |
| 12.6 | No commented-out code | 🔄 | |
| 12.7 | No TODO/FIXME without an issue | 🔄 | |

### Data and security

| # | Check | Status |
|---|-------|--------|
| 12.8 | Secrets in env only | ✅ | |
| 12.9 | `.env.example` lists required variables | ✅ | |
| 12.10 | DB roles (app_user) | ➖ | SQLite |
| 12.11 | DB timeouts | ➖ | SQLite |
| 12.12 | Section 10 all ✅ or ➖ | ✅ | |

### Deploy

| # | Check | Status |
|---|-------|--------|
| 12.13 | Production deploy works | ✅ | SSH deploy workflow |
| 12.14 | Hosting env configured | ✅ | |
| 12.15 | Production migrations via deploy, not laptop | ✅ | Entrypoint |
| 12.16 | Domain configured | ✅ | `APP_URL` |
| 12.17 | SSL works | ✅ | Terminated at reverse proxy |

### Documentation

| # | Check | Status |
|---|-------|--------|
| 12.18 | Section 11 complete | ✅ | |
| 12.19 | PROGRESS 100% | ➖ | Use `TASKS.md` |
| 12.20 | README has start instructions | ✅ | |
| 12.21 | TECH_CARD sections 1–10 are ✅ or ➖ | ✅ | |

---

## Summary

This card records the **current** stack. Do not introduce Neon, Next.js, Redis, R2, or a User/RBAC model unless an approved task explicitly changes the architecture.
