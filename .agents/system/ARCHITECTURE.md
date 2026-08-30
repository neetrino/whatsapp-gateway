# Rules, Skills, and References architecture

## Purpose

Separate permanent coding standards from repeatable task workflows and optional detailed knowledge. This keeps everyday context focused while making procedures portable across supported agents.

## Rules

Cursor-specific Rules live in `.cursor/rules/*.mdc`. They define how code must be written or changed globally, for matching files, or when a task makes the Rule relevant. Technology, architecture, security, testing, and delivery constraints remain Rules because they continuously govern implementation.

Empty `globs` can be intentional for task-relevant Rules; it is not automatically a configuration error. Rules should remain project-aware and must not turn template technology recommendations into universal requirements.

## Skills

Portable task workflows live only in `.agents/skills/<skill-name>/SKILL.md`. Both Cursor and Codex can discover this Agent Skills layout. Each Skill has one job, clear trigger and non-trigger boundaries, ordered work, verification, stop conditions where needed, and an output contract.

Add or revise Skills according to [`SKILL_AUTHORING_GUIDE.md`](SKILL_AUTHORING_GUIDE.md). Do not keep a duplicate `.cursor/skills/` tree.

## References

Skill-local `references/` contain detailed knowledge needed only during that workflow. Repository-wide templates, operational checklists, examples, and platform materials remain under `docs/reference/`. References are not automatically applied as permanent Rules.

## Catalog and lifecycle

- `.agents/catalog/catalog.json` registers curated Skill metadata and activation state.
- `.agents/catalog/profiles.json` composes project-oriented Skill sets through inheritance.
- `.agents/catalog/sources.lock.json` records immutable provenance for accepted external Skills.
- `.agents/skills/` contains active, agent-discoverable Skills.
- `.agents/library/` contains curated inactive Skills. Their presence in a profile does not make them discoverable.

Skill behavior remains in `SKILL.md`; catalog files do not duplicate workflow instructions. External Skills must pass [the intake policy](EXTERNAL_SKILL_POLICY.md) before catalog registration or installation.

## Decision guide

| Question | Type |
| --- | --- |
| “Always do it this way” | Rule |
| “For this task, perform these steps” | Skill |
| “Open this detailed information when needed” | Reference |

## Current structure

```text
.cursor/
└── rules/
    └── *.mdc

.agents/
├── README.md
├── skills/
│   ├── project-onboarding/
│   ├── debug-first/
│   ├── verify-before-completion/
│   ├── safe-database-migration/
│   ├── setup-production-migrations/
│   └── figma-to-production/
├── library/
│   ├── code-review/
│   ├── security-review/
│   ├── react-performance-review/
│   └── ui-accessibility-review/
├── catalog/
│   ├── README.md
│   ├── catalog.json
│   ├── profiles.json
│   └── sources.lock.json
└── system/
    ├── ARCHITECTURE.md
    ├── ROADMAP.md
    ├── DECISIONS.md
    ├── PHASE_STATUS.md
    ├── EXTERNAL_SKILL_POLICY.md
    ├── SKILL_AUTHORING_GUIDE.md
    └── SKILL_TRIGGER_TESTS.md

docs/
├── BRIEF.md
├── TECH_CARD.md
├── 01-ARCHITECTURE.md
└── reference/

scripts/
└── validate-agent-config.mjs
```

## Validation

Run the dependency-free structural validator after changing Rules, Skills, or their local links:

```bash
node scripts/validate-agent-config.mjs
```

The validator checks Skill and Rule metadata, catalog registration, profile inheritance, external provenance, governance files, canonical paths, and local Markdown links. Warnings identify maintainability concerns without failing validation.

## Composition versus activation

```text
Active
→ package exists in .agents/skills/ and is discoverable now

Library
→ curated package exists in .agents/library/ but is inactive

Profile
→ desired composition of active and library packages

Installer
→ future mechanism that will activate selected library packages
```

The first three library packages are internal. `ui-accessibility-review` is external-adapted and carries pinned source metadata and the reviewed source license inside its package.
