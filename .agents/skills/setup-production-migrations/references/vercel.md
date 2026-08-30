# Vercel production migrations

Vercel has no native one-shot migration job. Run migrations in external CI (usually GitHub Actions) on the exact commit, then deploy or promote production.

## Sequence

```text
checkout exact commit
→ install and verify
→ run db:migrate:deploy (or the project's production command)
→ only then vercel deploy / promote production
```

Do not apply migrations in Serverless or Edge startup, a request handler, or as an uncontrolled side effect of `next build`.

## Secrets

Store `DIRECT_URL` in the CI secret store that runs the job. Do not put migration-owner credentials in Vercel runtime env.

Runtime on Vercel receives `DATABASE_URL` only.

Preview must not receive production credentials. Prefer an isolated preview database (for example a Neon branch) or skip production-shaped migrations on Preview. Decide from the project's TECH_CARD; do not silently share the production database.

## Network

If the database is private, the CI runner must already be on an allowed network. Do not expose the database to the internet to make GitHub-hosted runners work.

## Inspect first

Read existing GitHub workflows, `vercel.json`, env mappings, and whether another job already deploys. Extend that path; do not add a second production deploy.

## Official docs

- [Prisma migrate deploy](https://www.prisma.io/docs/cli/migrate/deploy)
- [Vercel deployments](https://vercel.com/docs/deployments/overview)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
