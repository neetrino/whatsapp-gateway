---
name: code-review
description: Review a Git diff, commit range or pull request for correctness, regressions, requirement gaps, security, compatibility, maintainability and missing validation. Use when the user requests code review, PR review, diff review or an independent implementation assessment. Do not use for ordinary feature implementation, debugging an already reported defect or merely running completion checks.
---

# Code review

## Purpose

Provide evidence-based review of changed code without rewriting unrelated areas.

## Use when

Review a Git diff, commit range, pull request, major implementation before merge, or implementation-to-requirements alignment.

## Do not use when

Do not use for feature implementation, diagnosis of an already reported defect, execution-only completion checks, Figma parity, or a dedicated security audit. Use `debug-first`, `verify-before-completion`, `figma-to-production`, or `security-review` respectively.

## Inputs

Inspect user requirements, approved TECH_CARD and architecture decisions, base and head revisions, changed files, surrounding implementation, existing tests, and public contracts. Do not infer requirements from the diff alone when the task description is available.

## Workflow

1. Establish the base/head range, changed files, requirements, and affected applications or packages.
2. Read applicable project decisions.
3. Inspect the diff before expanding into surrounding code.
4. Review in priority order: correctness, data integrity, security, authorization, compatibility, regression risk, concurrency/state, error handling, performance, tests, maintainability, scope, then style.
5. Use [`references/review-checklist.md`](references/review-checklist.md) to avoid gaps without producing boilerplate findings.
6. Ignore formatter or linter output unless it represents a real defect.
7. For each finding, identify the location, concrete behavior, impact, evidence, and smallest complete correction.
8. Label it as a confirmed defect, likely risk, context question, or optional improvement. Never present speculation as confirmed.
9. Run targeted checks only when they materially validate a finding and repository tooling is available.
10. Do not modify code unless the user explicitly requests review and fixes.

An isolated reviewer may be used when available, but is never required. Provide it only the requirements, revision range, and relevant diff.

## Verification

Verify the relevant code path, inspect related tests, and check current project conventions before reporting a finding. If none exist, say “No actionable findings found in the reviewed scope” and still report what was not verified and remaining risk.

## Output

```text
Review scope
Findings by useful severity
Questions
Missing validation
Checks run
Recommendation
Remaining risk
```

Use Critical, High, Medium, and Low according to the reference; omit empty severity sections.
