# Coolify / Hetzner production migrations

Use a one-shot migrator container or service from the new commit/image. Application services start only after it exits successfully.

## Sequence

```text
Coolify builds the new version
→ migrator receives DIRECT_URL and runs the production command
→ success: start or switch application services
→ failure: keep the previous version
```

The migrator must exit after the command. Do not include it in persistent health checks.

## Compose

When the project uses Docker Compose, prefer a migrator service that the app `depends_on` with a completed-successfully condition when that Compose spec is actually in use. Verify the installed Coolify/Compose behavior; do not assume a flag exists.

## Pre / post deployment commands

Do not rely on Coolify pre- or post-deployment commands without checking the installed version:

- a pre-command may run in the old container;
- it may be skipped on the first deployment;
- a post-command failure may still leave the deployment marked successful.

Treat those hooks as insufficient until proven otherwise on this Coolify instance.

## Secrets

Store `DIRECT_URL` as a Coolify secret and pass it only to the migrator. Runtime services receive `DATABASE_URL` only.

## Inspect first

Read Compose files, Dockerfiles, Coolify service definitions, and any existing deploy hooks. Preserve a working migrator if one already exists.

## Official docs

- [Coolify Dockerfile deployment commands](https://next.coolify.io/docs/applications/builds/dockerfile)
- [Coolify Docker Compose](https://coolify.io/docs/applications/build-packs/docker-compose)
