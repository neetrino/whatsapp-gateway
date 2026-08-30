---
name: project-onboarding
description: Use when starting a new project from this template, analyzing the brief, defining project scope and size, preparing the TECH_CARD, and establishing the initial architecture and delivery workflow. Do not use for ordinary development in an already initialized project.
---

# Project onboarding

Use this workflow for a new project or an explicit onboarding restart. Do not run it for ordinary development tasks.

## Workflow

1. **Intake** — collect the brief, audience, must-have features, design links, integrations, constraints, and deadlines.
2. **Analyze the brief** — read `docs/BRIEF.md`, identify gaps and assumptions, and clarify decisions that affect scope or architecture.
3. **Determine project size** — use [`references/project-sizing.md`](references/project-sizing.md), propose **A / B / C** with a short rationale, and wait for confirmation.
4. **Prepare TECH_CARD** — copy [`docs/reference/templates/TECH_CARD_TEMPLATE.md`](../../../docs/reference/templates/TECH_CARD_TEMPLATE.md) to `docs/TECH_CARD.md` when needed and fill every relevant section. Do not write production code before key stack choices are approved.
5. **Confirm key decisions** — confirm project size, stack, services, hosting, security-sensitive choices, and adaptive limits. Ask for credentials only when they are needed; never invent them.
6. **Design architecture** — choose the folder layout for the confirmed size, follow the stack in TECH_CARD, apply [the architecture rule](../../../.cursor/rules/01-architecture.mdc), and document the result in `docs/01-ARCHITECTURE.md`.
7. **Initialize the project** — scaffold the agreed application with the approved package manager and framework, create `.env.example` without secrets, and establish the minimal documentation set.
8. **Configure the quality baseline** — set up the agreed checks and hooks according to [CI/CD rules](../../../.cursor/rules/17-cicd.mdc) and the [quality CI example](../../../docs/reference/workflows/ci-quality.yml.example).
9. **Plan development** — split delivery into phases, track work in `docs/PROGRESS.md`, follow the Git rules, and use the [project quality checklist](../../../docs/reference/Check/Quality/project-quality-checklist.md) when validating milestones.
10. **Prepare release** — perform the final TECH_CARD and quality review, configure deployment environment variables, set up the production migration job with [`setup-production-migrations`](../setup-production-migrations/SKILL.md) so local development never uses the production database, and verify monitoring according to [ops and reliability rules](../../../.cursor/rules/14-ops.mdc). Do not apply production migrations from a local machine.

## Verification

Confirm that the approved size, TECH_CARD decisions, architecture, environment contract, quality workflow, and development plan are recorded before implementation proceeds.

## Output

Report confirmed decisions, unresolved approvals, created or updated project documents, validation performed, and the next authorized phase.

## References

- Project-size criteria and proposal format: [`references/project-sizing.md`](references/project-sizing.md).
- Detailed layouts and constraints: [`references/project-sizes/`](references/project-sizes/).
- Long document templates: [`docs/reference/templates/`](../../../docs/reference/templates/).
- Permanent engineering standards remain in [`.cursor/rules/`](../../../.cursor/rules/) and apply throughout the workflow.
- Production migrate-on-deploy setup: [`setup-production-migrations`](../setup-production-migrations/SKILL.md).
