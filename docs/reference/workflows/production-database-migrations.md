# Production database migrations

Local development uses a local/dev database. Production schema changes are applied by one deploy job from the exact release commit. Do not point a laptop `.env` at production to run migrations.

Permanent rules: `.cursor/rules/06-database.mdc`, `.cursor/rules/17-cicd.mdc`.  
Agent workflow: `.agents/skills/setup-production-migrations/SKILL.md`.  
Schema-change safety: `.agents/skills/safe-database-migration/SKILL.md`.

## Local workflow

1. Change the schema.
2. Create the migration with the project's development command.
3. Apply and verify it on a clean and an existing local/dev database.
4. Commit schema and the full migration history.
5. Review and tests.
6. Deploy applies the same history to staging, then production.

Production URLs do not belong in local `.env`. A manual production run from a laptop is only an emergency or one-time baseline with explicit confirmation.

## Deploy order

```text
checkout exact commit
→ build immutable artifact / image
→ run one migration job
    → failure: stop rollout, previous app version stays active
    → success: deploy / promote the application
→ health checks, smoke tests, monitoring
```

Runtime, startup, request handlers, and `next build` must not migrate. One job owns a shared database for that release.

## Commands and variables

- Production command: non-interactive, idempotent, typically `db:migrate:deploy`.
- Prisma production: `prisma migrate deploy`. Do not automate `migrate dev`, `db push`, or `migrate reset` against production.
- `DATABASE_URL` — least-privilege runtime.
- `DIRECT_URL` — privileged migration connection, only in the job's secret store.

The provider (Neon, Cloud SQL, self-hosted PostgreSQL) changes endpoints and network path, not this contract. Pooled runtime vs direct migration endpoints are normal.

## Platforms

| Host | Migration owner |
| --- | --- |
| Vercel | External CI job, then deploy/promote. `DIRECT_URL` stays in CI, not Vercel runtime. |
| Cloud Run | Cloud Run Job from the same image digest, then service revision. |
| Hetzner / Coolify | One-shot migrator container that must succeed before app services start. |

Do not copy a generic workflow. Inspect the project, then follow the matching skill reference.

## Definition of done

- Local development does not use the production database.
- The job runs automatically from the exact release.
- Failure blocks the new app version.
- Preview/staging/production credentials are isolated.
- Destructive SQL still needs a separate approval and rollback plan.
- The project's command, job, and secret store are documented.
