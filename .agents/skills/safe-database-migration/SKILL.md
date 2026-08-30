---
name: safe-database-migration
description: Plan, create and validate safe relational database schema changes and migrations. Use when modifying Prisma or database schemas, adding or removing columns, tables, indexes, constraints or relations, changing data types, or preparing database migrations. Do not use for ordinary queries that leave the schema unchanged, or for wiring production migrate-on-deploy jobs.
---

# Safe database migration

## Purpose

Create project-aware migrations while protecting existing data, availability, deployment compatibility, and migration history.

## Use when

Use for relational schema changes, generated migrations, backfills coupled to schema evolution, or migration planning and review.

## Do not use when

Do not use for ordinary queries that leave the schema unchanged, for direct production execution without explicit authorization, or for setting up the production migrate-on-deploy job. Use [`setup-production-migrations`](../setup-production-migrations/SKILL.md) for that pipeline work.

## Inputs

Read database documentation, `docs/TECH_CARD.md` when present, ORM or migration configuration, current schema, migration history, affected application paths, data scale, and deployment model.

## Workflow

1. Detect the database, ORM, and migration framework; do not assume Prisma.
2. Inspect the current schema and ordered migration history.
3. Identify affected data, queries, writes, contracts, and deployed application versions.
4. Classify the change as **LOW**, **MEDIUM**, **HIGH**, or **DESTRUCTIVE** using [`references/migration-risk-guide.md`](references/migration-risk-guide.md).
5. Evaluate data loss, locks, table rewrites, invalid existing data, uniqueness conflicts, required backfills, foreign-key behavior, index creation impact, and rolling-deployment compatibility.
6. Define rollback or forward-fix handling. Prefer expand-and-contract for risky production changes.
7. Generate the migration with the project's tooling.
8. Inspect generated SQL or the framework's equivalent operations when available; do not trust generation blindly.
9. Test in a safe local or test environment with representative data when practical. Do not point local env at production to apply the migration.
10. Validate the schema/client artifacts and affected application behavior.
11. Document deployment ordering, backfill steps, monitoring, and remaining risk. Production application belongs to the project's deploy job, not a laptop.

## Verification

Confirm migration application from the preceding schema, expected resulting schema, preservation or intentional transformation of data, and compatibility with the application deployment sequence.

## Stop conditions

Stop before destructive or production execution without explicit authorization. Also stop when backups, data scale, provider constraints, migration history, or required backfill behavior cannot be established safely.

## Output

```text
Change
Framework
Risk classification
Data and availability risks
Migration plan
Validation
Deployment or rollback strategy
Approval required
Remaining risk
```
