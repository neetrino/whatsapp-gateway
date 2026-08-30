---
name: react-performance-review
description: Review React and Next.js implementation for high-impact performance risks such as slow routes, large bundles, request waterfalls, excessive client JavaScript, unnecessary server-to-client serialization, rendering inefficiency and costly rerenders. Use for explicit React or Next.js performance reviews, optimization assessments, known performance bottlenecks, or investigations after reproduction or root-cause evidence. Do not use for newly reported performance regressions or unexpected slowness whose root cause is still unknown, defect diagnosis, ordinary component implementation, isolated styling changes, generic completion validation or measured browser performance audits.
---

# React performance review

## Purpose

Identify high-impact React and Next.js implementation risks without applying optimization techniques mechanically. Prioritize measured or strongly evidenced problems.

## Use when

Use for explicit React/Next.js performance reviews, slow routes, large client bundles, suspected request waterfalls, excessive Client Component boundaries or serialization, expensive rerenders, rendering regressions, slow interactive dashboards, inefficient data fetching, or performance-focused refactors.

## Do not use when

Do not use as the first workflow for a newly reported slowdown or performance regression with an unknown cause; use `debug-first` to reproduce and identify the root cause first. Do not use for ordinary component or Figma implementation, copy/CSS changes, generic completion validation, generic code review, browser Core Web Vitals measurement, or non-React applications. Use `figma-to-production`, `code-review`, or `verify-before-completion` for their respective workflows. A future `web-performance-audit` will own measured browser runtime performance.

## Inputs

Inspect the reported symptom, affected route/component, React and Next.js versions, router model, Server/Client boundaries, data fetching, state and cache approaches, build configuration, existing measurements, architecture decisions, and relevant TECH_CARD. Do not prescribe framework or library migration outside scope.

## Workflow

1. **Define the signal.** Establish what is slow, where, who is affected, whether it is measured, and whether it reproduces. Do not begin with random optimization.
2. **Map execution boundaries.** Separate server, client, network, rendering, hydration, and background work. Identify latency, sequencing, bundle, execution, rendering, serialization, or duplication cost.
3. **Review high-impact areas first.** Check request waterfalls, independent sequential async work, client bundle size, unnecessary Client Components, excessive server-to-client data, duplicate fetching, repeated expensive rendering, unbounded lists, critical-interaction work, and third-party client code.
4. **Respect project architecture.** Do not automatically prescribe `React.memo`, `useMemo`, `useCallback`, dynamic imports, `React.cache`, SWR, TanStack Query, LRU caches, state-library replacement, or router migration. Verify actual cost, compatibility, maintenance impact, and approved equivalents first.
5. **Classify evidence.** Separate measured issues, strong implementation evidence, potential optimizations, low-priority micro-optimizations, and insufficient evidence.
6. **Recommend the smallest high-impact correction.** Include location, behavior, likely cost, evidence, safe correction, expected effect, and validation method; avoid unrelated refactors.
7. **Validate.** Prefer before/after timing, network timing, build output, bundle analysis, React Profiler, server timing, targeted benchmarks, render counts, or observability. If unavailable, label the result “Source-level review only.”

Use [`references/react-performance-checklist.md`](references/react-performance-checklist.md) to keep the review complete and proportional.

## Verification

Confirm the reviewed path, distinguish measurement from inference, ensure recommendations fit current versions and approved architecture, run targeted checks when available, and report checks not run. Never claim quantified improvement, bundle reduction, LCP gain, or eliminated rerenders without measurement.

## Output

```text
Reviewed scope
Reported or measured signal
Execution boundary
Findings
Evidence level
Impact priority
Recommended changes
Checks and measurements
Not measured
Remaining uncertainty
Remaining risk
```

Omit empty sections.
