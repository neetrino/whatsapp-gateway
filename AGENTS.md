# Repository guidance

This repository is **nbos-whatsapp-gateway** — a Size A standalone NestJS service. Keep product and Agent-system concerns separate.

## Before substantial work

1. Read the explicit user task and preserve its scope.
2. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) when it is relevant.
3. Read [`docs/TECH_CARD.md`](docs/TECH_CARD.md) when stack or hosting decisions are relevant.
4. For public API and client integration, follow [`docs/API.md`](docs/API.md) and [`docs/INTEGRATION.md`](docs/INTEGRATION.md).
5. Preserve the existing architecture and approved project decisions.

## Instruction locations

```text
Product documentation
→ ARCHITECTURE.md, README.md, docs/API.md, docs/INTEGRATION.md,
  docs/SECURITY.md, docs/DEPLOYMENT.md, docs/WAHA_SETUP.md, docs/OPERATIONS.md

Approved stack and services
→ docs/TECH_CARD.md

Cursor coding standards
→ .cursor/rules/

Reusable workflows
→ .agents/skills/

Skill catalog and profiles
→ .agents/catalog/

Agent-system documentation
→ .agents/system/
```

Use the applicable Rule or Skill instead of copying its full content into this file.

This project is already initialized (Size A, NestJS + Prisma + SQLite + WAHA). Do not run [`project-onboarding`](.agents/skills/project-onboarding/SKILL.md) during ordinary development.

## Decision precedence

```text
explicit approved task
→ ARCHITECTURE.md + product docs
→ approved TECH_CARD
→ existing project implementation
→ template recommendation
→ generic fallback
```

Preserve the existing implementation unless the approved task or TECH_CARD explicitly requires a migration or replacement.

## Working boundaries

- Do not change architecture, stack, public APIs, database schema, or business behavior outside the approved task.
- Do not perform production deployment.
- Do not perform production database migrations.
- Do not delete data.
- Do not commit or push without an explicit request.
- Do not hide or bypass test, lint, build, or validation failures.
- Do not weaken security controls to make a check pass.
- Preserve unrelated user changes and keep edits scoped.
- After meaningful changes, run project-appropriate validation and use [`.agents/skills/verify-before-completion/`](.agents/skills/verify-before-completion/).

For auth, tokens, webhooks, or other security-sensitive changes, use [`.agents/library/security-review/`](.agents/library/security-review/) (library until activated). For PR/diff review, use [`.agents/library/code-review/`](.agents/library/code-review/).

Report checks that were not run and any remaining uncertainty instead of claiming unsupported success.
