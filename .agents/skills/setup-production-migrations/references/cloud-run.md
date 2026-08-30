# Cloud Run production migrations

Use a separate Cloud Run Job from the same image digest as the service revision being released.

## Sequence

```text
build and push immutable image
→ point the migration Job at that digest
→ execute the Job with one task and wait
→ success: deploy the new Cloud Run Service revision
→ failure: do not shift production traffic
```

Do not put `prisma migrate deploy` or the project's equivalent in the Service startup command. Autoscaled instances must not migrate.

## Secrets

Store `DIRECT_URL` in Google Secret Manager. Grant it only to the migration Job service account.

The runtime Service receives `DATABASE_URL` only.

## Shared databases

If API, worker, and scheduler share one database, one Job owns migrations for that release. Do not let each service migrate.

## Inspect first

Read existing Cloud Build/Cloud Deploy pipelines, Job definitions, service accounts, and VPC connectors. Reuse the project's image build; do not invent a second image for migrations unless the repo already separates them.

## Official docs

- [Cloud Run Jobs](https://cloud.google.com/run/docs/execute/jobs)
- [Cloud Run Job secrets](https://cloud.google.com/run/docs/configuring/jobs/secrets)
