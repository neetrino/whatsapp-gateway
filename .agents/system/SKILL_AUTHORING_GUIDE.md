# Skill authoring guide

## Purpose

Create focused, maintainable task workflows that Cursor and Codex can discover from `.agents/skills/` without loading detailed material into every task.

## One Skill, one job

A Skill needs one clear responsibility, trigger, completion outcome, and safety boundary. Do not create a Skill merely to restate a Rule or collect loosely related advice.

## Required frontmatter

```yaml
---
name: skill-name
description: What it does, when to use it, and important non-trigger boundaries.
---
```

Use lowercase kebab-case and make `name` match the direct parent directory. Keep frontmatter minimal.

## Description quality

Include the main action, recognizable task keywords, a positive trigger, and an important non-trigger. Front-load the primary use case because descriptions drive implicit selection.

Avoid:

```text
Helps with development.
```

Prefer:

```text
Investigates and fixes software defects by reproducing the problem and identifying root cause before changing code. Use for runtime errors, regressions and unexpected behavior. Do not use for straightforward feature implementation.
```

## Recommended Skill structure

```text
Purpose
Use when
Do not use when
Inputs
Workflow
Verification
Stop conditions
Output
```

Not every Skill needs every section, but workflows that modify a repository should normally explain verification and output.

## Rules versus Skills

```text
Always follow this standard
→ Rule

Perform this workflow for this task
→ Skill

Read detailed information when required
→ Reference
```

## Progressive disclosure

Keep `SKILL.md` focused. Put detailed knowledge, examples, framework variants, and long checklists in `references/`. Use `scripts/` only for deterministic work that is genuinely reusable; prefer instructions when project context determines the implementation.

## Duplication policy

Do not copy complete Rule content into a Skill. Link to project Rules or documentation when permanent standards apply during a workflow.

## Safety

Any workflow that can modify production, delete data, change infrastructure, rotate credentials, deploy, or migrate data must state the explicit approval boundary and safe stop conditions.

## Output contracts

Define how the agent reports what it inspected, changed, verified, could not run, and still considers uncertain. Never permit success claims unsupported by an executed check.

## Review and validation

Add positive and negative routing examples to [`SKILL_TRIGGER_TESTS.md`](SKILL_TRIGGER_TESTS.md). Run:

```bash
node scripts/validate-agent-config.mjs
```

When Cursor is available, also confirm that the Skill appears in Settings and the slash-command list, then try one positive implicit trigger. If runtime verification is unavailable, report it as not run; do not create a duplicate `.cursor/skills/` tree.
