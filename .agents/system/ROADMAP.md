# Agent system roadmap

## Phase 1 — Rules, Skills and References separation

Status: completed

Outcome:

- permanent Rules separated from workflows;
- onboarding moved to Skill;
- detailed project-sizing information moved to references.

## Phase 2 — Rules audit and core Skills

Status: completed

Outcome:

- Rules made project-aware;
- four core implementation Skills added;
- Skill authoring guidance and trigger tests added;
- configuration validator added.

## Phase 2.1 — Agent-system isolation

Status: completed

Outcome:

- Agent governance moved out of product docs;
- `AGENTS.md` added;
- validator made cross-platform.

## Phase 3A — Catalog architecture and governance

Status: completed

Outcome:

- machine-readable catalog;
- composable profiles;
- source lock;
- external Skill intake policy.

## Phase 3B — External Skill research

Status: completed

## Phase 3C — Curated Skill library

Status: in progress

### Batch 1A — Internal Skill library and provenance hardening

Status: completed

Outcome:

- `code-review` internal library Skill;
- `security-review` internal library Skill;
- library package validation;
- external provenance hardening;
- profile state distinction.

### Batch 1B — Performance and Accessibility Skills

Status: completed

Outcome:

- independently authored internal `react-performance-review` after the external candidate failed licensing requirements;
- `ui-accessibility-review` adapted only from the pinned MIT-licensed primary source;
- Source Lock and package-level license validation hardened;
- frontend profile and trigger coverage extended.

Next: evaluate Batch 1 Skills on real projects, then begin Batch 2.

## Phase 3D — Profile refinement

Status: planned

## Phase 3E — Skill installer

Status: planned

## Phase 4 — Advanced workflows

Status: planned

Potential scope:

- security audits;
- performance audits;
- release workflows;
- incident workflows;
- optional specialized agents;
- hooks only where they provide measurable value.
