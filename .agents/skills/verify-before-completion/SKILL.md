---
name: verify-before-completion
description: Validate completed implementation work before reporting success. Use after meaningful code changes, bug fixes, refactors, UI implementation, API changes or configuration changes to run appropriate checks and verify affected behavior. Do not use for explanation-only tasks or changes that do not modify repository files.
---

# Verify before completion

## Purpose

Provide evidence that changed behavior works without assuming a particular package manager, workspace layout, framework, or command set.

## Use when

Use after meaningful repository changes and before reporting the implementation complete.

## Do not use when

Do not use for explanation-only work or tasks that make no repository changes.

## Inputs

Use the changed files, affected behavior, repository instructions, package manifests, available scripts, test configuration, and accessible runtime tools.

## Workflow

1. Inspect changed files and identify affected applications, packages, contracts, and user flows.
2. Detect the package manager, workspace structure, available scripts, test framework, and repository-specific instructions.
3. Select the smallest meaningful validation set; run targeted checks first and broader checks when impact requires them.
4. For typed code, run the relevant typecheck when available.
5. For source changes, run lint or the repository equivalent when available.
6. For business logic and regressions, run targeted tests.
7. For API changes, exercise or validate the affected endpoint and contract.
8. For database changes, validate the schema, generated client, and migration as applicable.
9. For UI changes, verify rendered behavior when tools are available, including relevant responsive, loading, empty, and error states; inspect the browser console.
10. Run a production build for broad, integration-heavy, or release-relevant changes.
11. Record every failure honestly. Do not weaken or bypass checks to obtain a green result.

## Verification

Match each user-visible or contractual claim to a check that was actually run. Never say “all tests passed” unless all relevant tests were executed and passed.

## Stop conditions

Stop and report when a required check needs unavailable credentials, infrastructure, approval, or tooling; when a failure is unrelated but blocks broader validation; or when repository instructions conflict.

## Output

```text
Changed scope
Checks run
Passed
Failed
Not run
Reason
Remaining risk
```
