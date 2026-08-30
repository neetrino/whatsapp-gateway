---
name: debug-first
description: Investigate, reproduce and fix software defects by identifying the root cause before modifying code. Use for bugs, regressions, unexpected behavior, runtime errors, failing requests, incorrect UI state and issues that require diagnosis. Do not use for straightforward feature implementation or simple requested content and styling changes.
---

# Debug first

## Purpose

Find evidence for the root cause before changing code, then deliver the smallest complete fix that preserves unrelated behavior.

## Use when

- A bug, regression, error, failing request, or incorrect state needs diagnosis.
- The cause is unknown or multiple layers may be involved.

## Do not use when

- The requested implementation is straightforward and no defect needs investigation.
- The task is only copy, content, or isolated styling work.

## Inputs

Collect the reported behavior, expected behavior, reproduction context, relevant environment, and available logs or failing checks. Never invent missing observations.

## Workflow

1. Restate the observed failure and expected behavior without adding assumptions.
2. Inspect the relevant code, project instructions, and architecture.
3. Reproduce the issue when possible.
4. Gather evidence from applicable sources: logs, stack traces, failing tests, network responses, browser console, database behavior, and recent related changes.
5. Separate verified facts from hypotheses.
6. Rank a small hypothesis list by likelihood, impact, and cost to test.
7. Test the highest-value hypothesis first and update the ranking from evidence.
8. Identify the root cause before broad refactoring.
9. Implement the smallest complete fix and preserve behavior outside the bug scope.
10. Add or update a regression test when it provides useful protection.
11. Run targeted verification, then broader checks according to impact.

Do not randomly modify unrelated areas, hide errors, remove tests, weaken validation, or add arbitrary delays or retries without identifying the cause. Compilation alone is not proof that the defect is fixed.

## Verification

Re-run the reproduction or closest deterministic check. Verify the regression test when added and inspect adjacent behavior affected by the fix.

## Stop conditions

Stop and report uncertainty when reproduction requires unavailable access, evidence contradicts the reported behavior, the fix requires an unapproved product or architecture decision, or safe verification is impossible.

## Output

Report:

```text
Observed behavior
Evidence
Root cause
Fix
Validation
Remaining risk
```

If reproduction is impossible, distinguish what was inspected from what remains hypothetical.
