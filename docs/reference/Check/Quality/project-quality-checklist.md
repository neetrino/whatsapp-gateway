# Project quality checklists (reference)

> **Role:** template-rules compliance checklist (DoD/PR) — verifies the project follows `.cursor/rules/`. For a full pre-release audit (P0/P1, how-to-check, Release Readiness Summary) use [release-audit-checklist.md](release-audit-checklist.md).

> Human-readable checklists. Moved from `.cursor/rules/19-checklists.mdc` (not loaded as AI rules — saves tokens). For coding limits use `00-core.mdc` and `03-typescript.mdc` (replaces removed `02-coding-standards.mdc`). Ops/reliability: `14-ops.mdc` (replaces `14-observability` + `18-reliability`).

# ՈՐԱԿԻ ՍՏՈՒԳԱՑՈՒՑԱԿՆԵՐ

> Ստուգացուցակներ — պաշտպանություն մարդկային սխալներից։ Օգտագործի՛ր դրանք համակարգված։

---

## 🎯 ՆԱԽԱԳԾԻ ՀԱՄԱՊԱՏԱՍԽԱՆՈՒԹՅԱՆ ԳԼԽԱՎՈՐ ՍՏՈՒԳԱՑՈՒՑԱԿ

### 1. Ընդհանուր պահանջներ (00-core)

- [ ] Նախագծի չափը որոշված է (A/B/C)
- [ ] AI-ն աշխատանք չի սկսում առանց չափի որոշման
- [ ] Արագելված գործողություններ չկան (secrets կոդում, `any`, force push)
- [ ] Խոշոր որոշումների համար — առաջարկվում են տարբերակներ հիմնավորմամբ

### 2. Ճարտարապետություն (01-architecture)

- [ ] Թղթապանակների կառուցվածքը համապատասխանում է նախագծի չափին
- [ ] `src/`-ը պարունակում է միայն կոդ
- [ ] Պարզ շերտերի բաժանում (features, shared, core)
- [ ] Circular dependencies չկան
- [ ] Barrel export-ներ (`index.ts`) որտեղ անհրաժեշտ է

### 3. Կոդի ստանդարտներ (00-core + 03-typescript; former 02-coding-standards removed)

- [ ] Naming conventions պահպանված են.
  - [ ] PascalCase — կոմպոնենտներ, դասեր, տիպեր
  - [ ] camelCase — փոփոխականներ, ֆունկցիաներ
  - [ ] UPPER_SNAKE_CASE — հաստատուններ
  - [ ] kebab-case — ֆայլեր և թղթապանակներ
- [ ] Ֆունկցիաներ ≤ 50 տող
- [ ] Ֆայլեր ≤ 300 տող
- [ ] Magic numbers չկան (օգտագործվում են անվանված հաստատուններ)
- [ ] Մեկնաբանված կոդ չկա
- [ ] DRY պահպանված է (կրկնօրինակում չկա)

### 4. TypeScript (03-typescript)

- [ ] `strict: true` в tsconfig
- [ ] `any` չկա (կամ փաստաթղթավորված է, թե ինչու)
- [ ] `@ts-ignore` բացատրություն 없ած չկա
- [ ] Types/Interfaces export արված են
- [ ] Օգտագործվում է `unknown` `any`-ի փոխարեն որտեղ հնարավոր է
- [ ] Exhaustive checks switch/union-ի համար
- [ ] `as const` լիտերալների համար
- [ ] Generics որտեղ տեղին է

### 5. React/Next.js (04-react-nextjs)

- [ ] Server Components լռելյայն
- [ ] `'use client'` միայն որտեղ անհրաժեշտ է
- [ ] Անվանված export-ներ (ոչ default)
- [ ] Props-ը տիպացված են (interface)
- [ ] Inline functions JSX-ում չկան (որտեղ կրիտիկ է)
- [ ] `useCallback` / `useMemo` որտեղ պետք է
- [ ] `key` prop ցանկերի համար
- [ ] Error Boundary սեկցիաների համար
- [ ] Loading/Error/NotFound states
- [ ] Image. օգտագործվում է `next/image`
- [ ] Links. օգտագործվում է `next/link`
- [ ] Metadata կարգավորված է

### 6. Backend/NestJS (05-backend-nestjs)

- [ ] Controller-ները բարակ են (միայն routing)
- [ ] Service-ները պարունակում են բիզնես-լոգիկա
- [ ] Dependency Injection օգտագործվում է
- [ ] DTO բոլոր մուտքային տվյալների համար
- [ ] Վալիդացիա `class-validator`-ով
- [ ] Guards աութորիզացիայի համար
- [ ] Exception Filters կարգավորված են
- [ ] Swagger փաստաթղթավորում

### 7. Տվյալների բազա (06-database)

- [ ] Prisma սխեման արդի է
- [ ] Միգրացիաներ աշխատում են (up/down)
- [ ] Լոկալ `.env`-ը չի օգտագործում Production database
- [ ] Production migrations-ը աշխատում են deploy job-ով (`db:migrate:deploy`), ոչ startup-ից և ոչ նոութբուքից
- [ ] Ինդեքսներ հաճախակի հարցումների համար
- [ ] N+1 խնդիրներ չկան (`include` օգտագործվում է)
- [ ] Transaction-ներ կապված գործողությունների համար
- [ ] Soft delete կարևոր տվյալների համար
- [ ] Պագինացիա ցանկերի համար
- [ ] **Դերեր և լիմիտներ (բոլոր նախագծեր).** *(մանրամասն. 06-database.mdc)*
  - [ ] `app_user` ստեղծված DML-only իրավունքներով
  - [ ] `DATABASE_URL` օգտագործում է `app_user` (ոչ owner)
  - [ ] `DIRECT_URL` օգտագործում է owner (միայն միգրացիաներ)
  - [ ] `statement_timeout` սահմանված *(ադապտիվ, տիրույթ 06-database-ում)*
  - [ ] `idle_in_transaction_session_timeout` սահմանված է
  - [ ] `lock_timeout` սահմանված է
- [ ] **Դերեր և լիմիտներ (Size B/C).**
  - [ ] `readonly_user` ստեղծված (անալիտիկա/աջակցություն)
  - [ ] `CONNECTION LIMIT` long-running backend-ի *(ադապտիվ, տիրույթ 06-database-ում)*
- [ ] **Եթե Neon.**
  - [ ] Connection pooling միացված է
  - [ ] `directUrl` միգրացիաների համար
  - [ ] Vercel Integration (եթե Vercel)

### 8. API Design (07-api-design)

- [ ] RESTful URL կառուցվածք
- [ ] Ճիշտ HTTP մեթոդներ (GET/POST/PUT/DELETE)
- [ ] Ճիշտ status code-եր
- [ ] Ստանդարտ պատասխանի ձևաչափ (`{ data, meta, error }`)
- [ ] DTO վալիդացիայով
- [ ] Swagger փաստաթղթավորումը արդի է
- [ ] Rate limiting (անհրաժեշտության դեպքում)
- [ ] Պագինացիա ցանկերի համար
- [ ] Վերսիոնավորում (`/v1/`)
- [ ] **Webhooks (եթե կան).**
  - [ ] HMAC-SHA256 ստորագրություն
  - [ ] Retry exponential backoff-ով
  - [ ] Իդեմպոտենտություն

### 9. Անվտանգություն (08-security) 🚨

- [ ] **Գաղտնիքներ.**
  - [ ] Կոդում գաղտնիքներ չկան
  - [ ] Ամեն ինչ `.env` / secrets manager-ում
  - [ ] `.env.example` առանց արժեքների
- [ ] **Աուտենտիֆիկացիա.**
  - [ ] Գաղտնաբառերը hash արված (argon2)
  - [ ] Provider-ը և session strategy-ն համապատասխանում են TECH_CARD-ին
  - [ ] Session/token TTL-ը, rotation-ը և invalidation-ը կարգավորված են
  - [ ] Logout-ից հետո session/token-ը այլևս վավեր չէ
- [ ] **Աուտորիզացիա.**
  - [ ] RBAC իրականացված է
  - [ ] Guards-ը ստուգում են իրավունքները
  - [ ] Principle of least privilege
- [ ] **Պաշտպանություն հարձակումներից.**
  - [ ] Input validation ամենուր
  - [ ] SQL/NoSQL injection չկա
  - [ ] XSS պաշտպանություն (sanitization)
  - [ ] CSRF պաշտպանություն
  - [ ] CORS ճիշտ կարգավորված է
- [ ] **Cookies (եթե cookie-based auth է).**
  - [ ] `httpOnly: true`
  - [ ] `secure: true`
  - [ ] `sameSite: 'strict'`
- [ ] **Կախվածություններ.**
  - [ ] `npm audit` critical-ից զուրկ
  - [ ] Կախվածությունները թարմացված են

### 10. Դիզայն/Figma (09-figma-design)

- [ ] Design token-ներ օգտագործվում են
- [ ] Tailwind config-ը համապատասխանում է դիզայնին
- [ ] Կոմպոնենտները համապատասխանում են Figma-ին
- [ ] Responsive design (mobile-first)
- [ ] Հիմնական accessibility (a11y).
  - [ ] `alt` images-ի համար
  - [ ] `aria-label` որտեղ պետք է
  - [ ] Keyboard navigation
  - [ ] Contrast ratio
- [ ] Animations չափից շատ չեն

### 11. Թեստավորում (10-testing)

- [ ] Unit թեստեր բիզնես-լոգիկայի համար
- [ ] Integration թեստեր API-ի համար
- [ ] E2E թեստեր կրիտիկ flows-ի համար
- [ ] Թեստային բուրգը պահպանված է
- [ ] Mock/stub պաթեռններ օգտագործվում են
- [ ] Data factories թեստային տվյալների համար
- [ ] Ծածկույթ ≥ 70% նոր լոգիկայի համար
- [ ] Թեստերը flaky չեն

### 12. Փաստաթղթավորում (11-documentation)

- [ ] `README.md` հրահանգներով
- [ ] `docs/` թղթապանակը ստեղծված է
- [ ] `docs/01-ARCHITECTURE.md`
- [ ] `docs/PROGRESS.md`
- [ ] API փաստաթղթավորում (Swagger)
- [ ] `.env.example`-ը փաստաթղթավորում է բոլոր փոփոխականները
- [ ] Runbook-ներ ինցիդենտների (production)
- [ ] ADR կարևոր որոշումների համար

### 13. Error Handling (12-error-handling)

- [ ] Custom error class-ներ օգտագործվում են
- [ ] Global Exception Filter (backend)
- [ ] Error Boundary (frontend)
- [ ] API սխալներ RFC 7807 ձևաչափով
- [ ] Retry exponential backoff-ով
- [ ] Graceful degradation
- [ ] Սխալները լոգավորվում են (sensitive data-ից զուրկ)

### 14. Git Workflow (13-git-workflow)

- [ ] Branching strategy-ն պահպանված է
- [ ] Naming. `feature/`, `bugfix/`, `hotfix/`
- [ ] Conventional Commits
- [ ] PR ≤ 400 տող
- [ ] PR նկարագրությունը լրացված է
- [ ] Self-review PR-ից առաջ
- [ ] Force push main/develop-ում չկա
- [ ] Commit-ներում գաղտնիքներ չկան
- [ ] CHANGELOG-ը վարելի է

### 15. Observability (14-ops.mdc)

- [ ] Structured logging (`pino`)
- [ ] Ճիշտ log level-ներ
- [ ] Correlation ID tracing-ի համար
- [ ] Լոգերում sensitive data չկա
- [ ] Մետրիկներ (production-ի դեպքում).
  - [ ] HTTP metrics (rate, errors, duration)
  - [ ] Business metrics
  - [ ] Database metrics
- [ ] Ալերտներ կարգավորված են

### 16. Performance (15-performance)

- [ ] **Core Web Vitals.**
  - [ ] LCP < 2.5s
  - [ ] INP < 200ms
  - [ ] CLS < 0.1
- [ ] **Images.**
  - [ ] `next/image` օգտագործվում է
  - [ ] WebP/AVIF ֆորմատներ
  - [ ] Lazy loading
- [ ] **Bundle.**
  - [ ] Code splitting (`next/dynamic`)
  - [ ] Barrel export խնդիրներ չկան
  - [ ] Tree shaking աշխատում է
- [ ] **Caching.**
  - [ ] React Query server state-ի համար
  - [ ] HTTP caching headers
  - [ ] Redis (անհրաժեշտության դեպքում)
- [ ] **Backend.**
  - [ ] Օպտիմիզացված DB հարցումներ
  - [ ] Connection pooling
  - [ ] Զուգահեռ հարցումներ որտեղ հնարավոր է

### 17. State Management (16-state-management)

- [ ] Server state → React Query
- [ ] Client state → Zustand
- [ ] Form state → React Hook Form
- [ ] URL state → useSearchParams / nuqs
- [ ] Server data global store-ում չկա
- [ ] State-ի կրկնօրինակում չկա
- [ ] Սելեկտորներ ածանցյալ տվյալների համար

### 18. CI/CD (17-cicd)

- [ ] **CI Pipeline.**
  - [ ] Lint (ESLint)
  - [ ] Format (Prettier)
  - [ ] Type check (TypeScript)
  - [ ] Unit tests
  - [ ] Build
  - [ ] Security audit
- [ ] **CD Pipeline.**
  - [ ] Preview deployments
  - [ ] Staging environment
  - [ ] Production deploy
  - [ ] Database migrations
    - [ ] Մի job exact commit-ից. failure-ը կանգնեցնում է rollout-ը
    - [ ] `DIRECT_URL` միայն migration job-ում, ոչ runtime-ում
- [ ] **Feature Flags (եթե կան).**
  - [ ] Փաստաթղթավորված են
  - [ ] Kill switch-ը աշխատում է
  - [ ] Հիները ջնջվում են
- [ ] **Managed platforms (Vercel/Railway).**
  - [ ] Environment variables
  - [ ] Health check endpoint

### 19. Reliability (14-ops.mdc; former 18-reliability merged)

- [ ] Timeout-եր բոլոր արտաքին կանչերի վրա
- [ ] Retry с exponential backoff
- [ ] Circuit Breaker (արտաքին սերվիսների համար)
- [ ] Graceful shutdown
- [ ] Health check endpoint
- [ ] Fallback-ներ non-critical ֆիչերի համար
- [ ] Rate limiting (client-side որտեղ պետք է)

### 20. Ինտերնացիոնալացում (20-i18n)

> Բաց թողնել, եթե նախագիծը միալեզու է

- [ ] Բոլոր տեքստերը թարգմանությունների ֆայլերում
- [ ] Կոմպոնենտներում տեքստի hardcode չկա
- [ ] Intl API ֆորմատավորման համար (ամսաթվեր, թվեր, արժույթներ)
- [ ] Pluralization-ը ճիշտ է
- [ ] Language switcher-ը աշխատում է
- [ ] hreflang tag-եր (SEO)

---

## 🎯 DEFINITION OF DONE (DoD)

### Ֆիչը ավարտված է, երբ.

#### Կոդ
- [ ] Կոդը գրված և աշխատում է
- [ ] TypeScript. 0 սխալ
- [ ] ESLint. 0 errors, 0 warnings
- [ ] Prettier. կոդը ֆորմատված է
- [ ] `any` տիպեր չկան
- [ ] `console.log` չկա
- [ ] Մեկնաբանված կոդ չկա
- [ ] Ֆունկցիաներ ≤ 50 տող
- [ ] Ֆայլեր ≤ 300 տող

#### Թեստավորում
- [ ] Unit թեստեր գրված են
- [ ] Թեստերն անցնում են
- [ ] Edge case-եր ծածկված են

#### Փաստաթղթավորում
- [ ] JSDoc հրապարակային ֆունկցիաների համար
- [ ] PROGRESS.md թարմացվել է
- [ ] API docs արդի են (եթե API կա)

#### Անվտանգություն
- [ ] Input validation
- [ ] Մուտքի իրավունքները ստուգված են
- [ ] Կոդում գաղտնիքներ չկան

#### Որակ
- [ ] Code review անցվել է
- [ ] Self-review կատարվել է

---

## 📝 PR CHECKLIST

### PR ստեղծելուց առաջ

```markdown
## Self-Review

### Կոդ
- [ ] Կարդացել եմ իր diff-ը
- [ ] Կոդը հասկանալի է առանց իմ մեկնաբանությունների
- [ ] Ժամանակավոր/debug կոդ չկա
- [ ] TODO issue reference-ից զուրկ չկա

### Տիպացում
- [ ] `any` չկա
- [ ] `@ts-ignore` բացատրություն առանց չկա
- [ ] Types export արված են

### Թեստեր
- [ ] Նոր կոդը ծածկված է թեստերով
- [ ] Edge case-եր ստուգված են
- [ ] Թեստերը flaky չեն

### Անվտանգություն
- [ ] Գաղտնիքների hardcode չկա
- [ ] Input validation
- [ ] Մուտքի իրավունքները ստուգված են

### Արտադրողականություն
- [ ] N+1 query-ներ չկան
- [ ] Ավելորդ re-render-ներ չկան

### Տվյալների բազա (եթե կա)
- [ ] Միգրացիաներ աշխատում են
- [ ] Ինդեքսներ ավելացված են
- [ ] Breaking changes չկան

### API (եթե կա)
- [ ] Backward compatible
- [ ] Swagger-ը թարմացվել է
```

### PR նկարագրության կաղապար

```markdown
## Փոփոխության տիպ

- [ ] 🚀 Feature
- [ ] 🐛 Bugfix
- [ ] 🔧 Refactor
- [ ] 📚 Docs
- [ ] ⚡ Performance
- [ ] 🧪 Test

## Նկարագրություն

[Ինչ փոխվել է և ինչու]

## Կապված առաջադրանքներ

- Closes #123

## Ինչպես թեստավորել

1. Քայլ 1
2. Քայլ 2
3. Ակնկալվող արդյունք

## Screenshots (UI-ի դեպքում)

| Before | After |
|--------|-------|
|        |       |

## Checklist

- [ ] Self-review կատարվել է
- [ ] Թեստեր ավելացվել են
- [ ] Փաստաթղթավորումը թարմացվել է
- [ ] CI-ն անցնում է
```

---

## 🚀 RELEASE CHECKLIST

### Pre-Release

```markdown
## Կոդ
- [ ] Բոլոր PR-ները merge արված են
- [ ] Տարբերակը թարմացվել է
- [ ] CHANGELOG-ը թարմացվել է

## Թեստավորում
- [ ] Unit թեստերն անցնում են
- [ ] Integration թեստերն անցնում են
- [ ] E2E թեստերն անցնում են
- [ ] Staging-ը թեստավորված է

## Տվյալների բազա
- [ ] Միգրացիաները թեստավորված են
- [ ] Backup-ը ստեղծված է

## Ինֆրակառուցվածք
- [ ] Environment variables настроены
- [ ] Мониторинг готов
```

### Deploy

```markdown
## Процесс
- [ ] Deploy запущен
- [ ] Health checks проходят
- [ ] Smoke tests OK
- [ ] Метрики в норме
- [ ] Нет ошибок в логах

## Post-Deploy
- [ ] Команда уведомлена
- [ ] Issues закрыты
```

### Rollback

```markdown
- [ ] Проблема подтверждена
- [ ] Rollback одобрен
- [ ] Database rollback (если нужно)
- [ ] Revert deploy
- [ ] Health checks OK
- [ ] Incident report создан
```

---

## 🔍 CODE REVIEW CHECKLIST

### Для Reviewer

```markdown
## Функциональность
- [ ] Код решает задачу
- [ ] Edge cases обработаны
- [ ] Нет очевидных багов

## Читаемость
- [ ] Код понятен
- [ ] Naming понятный
- [ ] Структура логичная

## Архитектура
- [ ] Соответствует проекту
- [ ] SRP соблюдается
- [ ] DRY соблюдается

## Тесты
- [ ] Покрывают сценарии
- [ ] Читаемые

## Безопасность
- [ ] Нет vulnerabilities
- [ ] Input validation
- [ ] Authorization

## Производительность
- [ ] Нет N+1
- [ ] Нет obvious issues
```

---

## 📋 НОВЫЙ ПРОЕКТ CHECKLIST

```markdown
## Инициализация
- [ ] Репозиторий создан
- [ ] .gitignore настроен
- [ ] README.md базовый

## Код
- [ ] TypeScript (strict: true)
- [ ] ESLint настроен
- [ ] Prettier настроен
- [ ] Path aliases (@/)

## Проект
- [ ] Размер определён (A/B/C)
- [ ] Структура папок создана
- [ ] docs/ папка создана
- [ ] PROGRESS.md создан

## Quality Automation (Step 3.1.1 from onboarding)
- [ ] `pnpm add -D prettier vitest husky lint-staged @commitlint/cli @commitlint/config-conventional`
- [ ] `pnpm husky init` + hooks: `.husky/pre-commit` (lint-staged), `.husky/commit-msg` (commitlint)
- [ ] lint-staged config added to package.json
- [ ] Scripts from 17-cicd.mdc added (ci:check, format:check, lint, typecheck, test, build)
- [ ] `--max-warnings=0` in lint, `--passWithNoTests` in test
- [ ] CI workflow: `cp docs/reference/workflows/ci-quality.yml.example .github/workflows/ci.yml`
- [ ] Dependabot: uncomment npm section in `.github/dependabot.yml`

## DevOps
- [ ] CI/CD настроен (или Vercel/Railway auto)
- [ ] .env.example создан
- [ ] Environment variables задокументированы

## База данных
- [ ] Prisma настроен
- [ ] Начальная схема создана
- [ ] Neon подключён (если используется)
- [ ] `app_user` создан (см. 06-database)
- [ ] Локальный `.env` не указывает на production
- [ ] Production migrations запускаются deploy job-ом, не с ноутбука

## Хранилище файлов
- [ ] Cloudflare R2 подключён (env vars заполнены)
- [ ] `public/` используется только для статических ассетов (favicon, robots.txt)

## GitHub Settings (manual, developer does this)
- [ ] Branch Protection on main: require "Quality checks" to pass
- [ ] Secret Protection (Scanning) enabled: Settings > Code security > Enable
- [ ] Dependabot enabled (already in repo if template used)

## Безопасность
- [ ] Нет секретов в коде
- [ ] CORS настроен
- [ ] Helmet (если backend)
```

---

## 📊 МЕТРИКИ КАЧЕСТВА

### Код

| Метрика | Цель | Как измерить |
|---------|------|--------------|
| TypeScript errors | 0 | `tsc --noEmit` |
| ESLint errors | 0 | `eslint .` |
| Test coverage | ≥ 70% | `jest --coverage` |
| Function length | ≤ 50 lines | ESLint rule |
| File length | ≤ 300 lines | ESLint rule |

### Performance

| Метрика | Цель | Как измерить |
|---------|------|--------------|
| LCP | < 2.5s | Lighthouse |
| INP | < 200ms | Lighthouse |
| CLS | < 0.1 | Lighthouse |
| Bundle size | < 200KB (initial) | Bundle analyzer |

### CI/CD

| Метрика | Цель | Как измерить |
|---------|------|--------------|
| CI success rate | ≥ 95% | GitHub Actions |
| CI duration | < 10 min | GitHub Actions |
| Deploy success | ≥ 99% | Deploy logs |

### Production

| Метрика | Цель | Как измерить |
|---------|------|--------------|
| Availability | ≥ 99.9% | Monitoring |
| Error rate | < 0.1% | Logs/metrics |
| P99 latency | < 500ms | APM |

---

## 🔄 ЕЖЕДНЕВНЫЙ CHECKLIST

### Начало работы

```markdown
- [ ] Pull последние изменения
- [ ] Проверить CI статус
- [ ] Посмотреть открытые PR для review
- [ ] Обновить PROGRESS.md (статус задач)
```

### Конец работы

```markdown
- [ ] Закоммитить/запушить изменения
- [ ] Обновить PROGRESS.md
- [ ] CI зелёный
- [ ] Заметки о следующих шагах
```

---

**Версия:** 2.1
**Дата:** 2026-02-12
