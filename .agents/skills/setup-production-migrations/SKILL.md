---
name: setup-production-migrations
description: Set up or audit automated production database migrations so they run as one deploy job from the release commit, not from a developer laptop or app startup. Use when wiring migrate-on-deploy for Vercel, Cloud Run, or Coolify, or when local environments still point at production. Do not use for ordinary schema changes on a project that already has a compliant migration job.
---

# Setup production migrations

## Purpose

Give the project one idempotent production migration job that runs during deploy from the exact release commit, while local development stays on a local/dev database.

## Use when

- Adding or repairing migrate-on-deploy for Vercel, Cloud Run, Coolify/Hetzner, or equivalent.
- Local `.env` or scripts still use production database URLs.
- Migrations run from app startup, `next build`, a request handler, or a developer laptop.
- Greenfield release setup needs a production migration job before the first production deploy.

## Do not use when

- The task is an ordinary schema change on a project whose deploy job already matches this contract. Use [`safe-database-migration`](../safe-database-migration/SKILL.md).
- The user asked only to explain pooling, Prisma, or SQL with no pipeline work.

## Inputs

Read `docs/TECH_CARD.md` when present, hosting and CI manifests, ORM/migration config, schema and migration history, existing scripts, Docker/Compose, which services share the database, which variables runtime and the migration CLI actually read, and whether the database is reachable from the deploy environment or only a private network.

Permanent invariants: [database rules](../../../.cursor/rules/06-database.mdc), [CI/CD rules](../../../.cursor/rules/17-cicd.mdc). Human contract: [`docs/reference/workflows/production-database-migrations.md`](../../../docs/reference/workflows/production-database-migrations.md).

## Workflow

1. Inspect the project. Do not invent commands from the framework name.
2. Classify the project:
   - **ready** — the job matches the contract; prove it with tests.
   - **partial** — keep what works; add only the missing pieces.
   - **not ready** — create the migration job.
   - **unsafe** — migrations run from runtime, startup, build, or a laptop with a production secret; agree the transition before changing deploy.
3. Check migration history against the real schema where that is authorized. Stop and report drift instead of automating a mismatched history.
4. Present the plan, risks, rollback, and the exact commands found in the repo. Wait for confirmation before adding or changing a live deploy job.
5. Keep local `DATABASE_URL` / `DIRECT_URL` on local/dev only. Remove production URLs from developer env files when they are present in the repo or documented as local practice.
6. Ensure one non-interactive idempotent production command, typically `db:migrate:deploy`. Prisma: `prisma migrate deploy`. Do not automate `prisma migrate dev`, `prisma db push`, or `prisma migrate reset` against production.
7. Give the migration job `DIRECT_URL` (or an in-process substitute) and the runtime `DATABASE_URL` only. Preview must not receive production credentials.
8. Implement the job for the detected host. Read the matching reference; do not copy a generic workflow across platforms:
   - Vercel: [`references/vercel.md`](references/vercel.md)
   - Google Cloud Run: [`references/cloud-run.md`](references/cloud-run.md)
   - Hetzner/Coolify: [`references/coolify.md`](references/coolify.md)
9. Keep one job owner per database per release. Shared API/worker/scheduler databases must not each migrate.
10. Leave destructive SQL on the [`safe-database-migration`](../safe-database-migration/SKILL.md) path. An automated job does not approve drops, type rewrites, or long locks.
11. Document the project-specific command, job location, secret store, and local workflow. Store only empty variable names in `.env.example`.

## Verification

Confirm, without applying production migrations from this session:

- local/dev env does not use production URLs;
- production command exists, is non-interactive, and is the only automated path;
- job uses the same commit/image as the app being released;
- failure prevents rollout of the new app version;
- `DIRECT_URL` is absent from runtime, images, logs, and Git;
- Preview/staging are isolated from production credentials.

When checks are available, prove a successful pending migration and an intentional failure on a non-production database. Report checks that were not run.

## Stop conditions

Stop before running a production migration, putting `DIRECT_URL` in Vercel/Cloud Run Service/app runtime, opening the database to the internet for CI, deleting data, or changing deploy without confirmation. Also stop when schema/history drift, backups, or network access to the database cannot be established safely.

## Output

```text
Classification
Hosting and migration owner
Current vs required command
Secret placement
Network path
Drift / baseline status
Proposed or implemented job
Verification
Not run
Remaining risk
Approval required
```
