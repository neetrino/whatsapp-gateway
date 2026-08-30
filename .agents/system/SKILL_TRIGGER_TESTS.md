# Skill trigger tests

These routing cases review Skill descriptions for clear positive and negative boundaries. They are specification examples, not a substitute for runtime discovery checks.

## project-onboarding

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Start a new project from this template and prepare its TECH_CARD.” | `project-onboarding` | New-project initialization and decisions. |
| “Read the completed BRIEF, recommend A/B/C size, and design the initial architecture.” | `project-onboarding` | Sizing and initial architecture workflow. |
| “We are restarting greenfield setup; establish stack, docs, quality checks, and delivery phases.” | `project-onboarding` | Explicit onboarding restart. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Add a filter to the existing orders page.” | No `project-onboarding` | Ordinary feature implementation. |
| “The current login endpoint returns 500; find the cause.” | `debug-first` | Defect diagnosis, not initialization. |
| “Check whether my completed refactor passes relevant tests.” | `verify-before-completion` | Completion validation. |

## debug-first

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “The profile endpoint started returning 500 after the latest change. Find the cause and fix it.” | `debug-first` | Requires root-cause diagnosis. |
| “The modal sometimes shows stale data; reproduce the regression and repair it.” | `debug-first` | Unexpected UI state with unknown cause. |
| “This test fails only when the full suite runs. Investigate before changing code.” | `debug-first` | Evidence-driven investigation is required. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Add a profile avatar field to the account page.” | No `debug-first` | Straightforward feature work. |
| “Change the button label to Continue.” | No `debug-first` | Isolated content change. |
| “Implement this Figma checkout screen.” | `figma-to-production` | Design-driven implementation. |

## verify-before-completion

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “The API refactor is done. Run the appropriate checks before reporting completion.” | `verify-before-completion` | Meaningful completed code change. |
| “Validate the UI we just implemented, including its rendered states.” | `verify-before-completion` | Requires project-aware final checks. |
| “Before handing off this configuration change, prove the affected build still works.” | `verify-before-completion` | Completion claim needs evidence. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Explain how Server Components work.” | No `verify-before-completion` | Explanation-only task. |
| “Summarize this document without editing files.” | No `verify-before-completion` | No repository modification. |
| “Why is this request failing with 401?” | `debug-first` | Diagnosis comes before completion checks. |

## safe-database-migration

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Make `customer.email` required without losing existing rows.” | `safe-database-migration` | Constraint and backfill planning. |
| “Rename this production column safely across a rolling deployment.” | `safe-database-migration` | Compatibility-sensitive schema change. |
| “Add a unique index to this large table and inspect the generated migration.” | `safe-database-migration` | Index and existing-data risk. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Optimize this read query without changing the schema.” | No `safe-database-migration` | Ordinary query work. |
| “Explain what a database transaction is.” | No `safe-database-migration` | Explanation-only request. |
| “Run the pending migration in production now.” | `safe-database-migration` (stop before execution) | The workflow must enforce explicit production authorization. |
| “Stop applying production migrations from our laptops; wire migrate-on-deploy for Vercel.” | `setup-production-migrations` | Pipeline setup, not schema design. |

## setup-production-migrations

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Stop applying production migrations from our laptops; wire migrate-on-deploy for Vercel.” | `setup-production-migrations` | Local-to-production practice must become a deploy job. |
| “Add a Cloud Run Job that runs `prisma migrate deploy` before the new service revision.” | `setup-production-migrations` | Host-specific production migration job. |
| “Our Coolify app migrates on container startup. Move that to a one-shot migrator.” | `setup-production-migrations` | Unsafe runtime migrations need a job owner. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Make `customer.email` required without losing existing rows.” | `safe-database-migration` | Schema-change planning, job already assumed. |
| “Explain what Prisma migrate deploy does.” | No `setup-production-migrations` | Explanation-only request. |
| “Add a nullable column to the local development schema.” | `safe-database-migration` | Ordinary schema change. |

## figma-to-production

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Implement this Figma dashboard using our existing design system.” | `figma-to-production` | Figma-driven screen implementation. |
| “Build this responsive component from the attached design and compare the rendered result.” | `figma-to-production` | Design analysis and visual verification. |
| “Match the checkout page to this screenshot without duplicating our UI primitives.” | `figma-to-production` | Visual parity with reuse constraints. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Change this heading from Plans to Pricing.” | No `figma-to-production` | Isolated copy edit. |
| “Make the existing divider two pixels thicker.” | No `figma-to-production` | Simple styling change without design analysis. |
| “The mobile layout suddenly overlaps after yesterday’s commit; diagnose it.” | `debug-first` | Regression diagnosis is primary. |

## code-review

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Review the changes between main and this branch for correctness and regression risks.” | `code-review` | Diff review before merge. |
| “Review this pull request against the approved requirements.” | `code-review` | Independent requirements assessment. |
| “Inspect this Git diff and report actionable findings before merge.” | `code-review` | Evidence-based changed-code review. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “The login endpoint returns 500. Find and fix the cause.” | `debug-first` | Reported defect requires diagnosis. |
| “Run the relevant tests and build before reporting completion.” | `verify-before-completion` | Execution of checks, not review. |
| “Audit authentication and tenant authorization for security weaknesses.” | `security-review` | Dedicated security assessment. |

## security-review

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Audit this authentication flow for realistic security vulnerabilities.” | `security-review` | Explicit security audit. |
| “Review tenant authorization and verify that users cannot access another tenant's records.” | `security-review` | Object and tenant authorization boundary. |
| “Perform a security review of this webhook endpoint and signature verification.” | `security-review` | Security-sensitive external entry point. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Review this PR for general correctness.” | `code-review` | General review, not dedicated security scope. |
| “Add a normal profile field.” | No `security-review` | Ordinary feature without a material security boundary. |
| “The endpoint returns an unexpected 500.” | `debug-first` | Defect diagnosis is primary. |

## react-performance-review

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Review this React dashboard for avoidable rerenders and expensive client work.” | `react-performance-review` | Explicit React performance assessment. |
| “Find the highest-impact Next.js performance risks in this feature before release.” | `react-performance-review` | Project-aware performance review with prioritization. |
| “Check whether this component tree has unnecessary client boundaries or repeated computation.” | `react-performance-review` | React rendering and boundary analysis. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “The page became slow after yesterday's commit; reproduce and fix the regression.” | `debug-first` | A reported regression requires root-cause diagnosis first. |
| “Implement this Figma screen in React.” | `figma-to-production` | Design implementation is primary. |
| “Explain what React memoization does.” | No `react-performance-review` | Explanation-only request. |

## ui-accessibility-review

### Positive

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Review this checkout UI for keyboard, focus, form, and screen-reader accessibility.” | `ui-accessibility-review` | Explicit accessibility assessment. |
| “Audit this dialog and menu against our accessibility and interaction requirements.” | `ui-accessibility-review` | Overlay semantics and keyboard behavior are in scope. |
| “Check this responsive page for touch targets, motion, loading states, and accessible navigation.” | `ui-accessibility-review` | Broad UI accessibility and UX review. |

### Negative

| Prompt | Expected | Reason |
| --- | --- | --- |
| “Implement this attached Figma design.” | `figma-to-production` | Design implementation is primary. |
| “The modal focus trap stopped working after an upgrade; find and fix the cause.” | `debug-first` | A concrete defect requires diagnosis. |
| “Change the button label from Save to Submit.” | No `ui-accessibility-review` | Isolated copy edit does not require a review workflow. |
