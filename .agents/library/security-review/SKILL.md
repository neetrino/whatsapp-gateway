---
name: security-review
description: Perform an evidence-based security review of application code, authentication, authorization, sensitive data flows, integrations and exposed attack surfaces. Use for explicit security audits or security-sensitive changes involving auth, permissions, payments, webhooks, file uploads, personal data, multi-tenant access or external integrations. Do not use as a replacement for permanent security Rules or for every ordinary code change.
---

# Security review

## Purpose

Identify realistic security weaknesses, validate exploitability, reject false positives, and recommend the smallest safe remediation.

## Use when

Use for explicit security audits and changes involving identity, permissions, payments, sensitive data, tenants, webhooks, integrations, uploads, redirects, public APIs, credentials, or security-sensitive infrastructure.

## Do not use when

Do not use for ordinary styling, routine implementation without a material security boundary, generic code review, or a dependency update without a security-review request. Permanent prevention requirements remain in [`.cursor/rules/08-security.mdc`](../../../.cursor/rules/08-security.mdc).

## Inputs

Define scope, assets, trust boundaries, entry points, authentication, authorization, sensitive data, external services, runtime configuration, applicable Rules, and TECH_CARD decisions.

## Workflow

1. Define the reviewed scope and protected assets.
2. Identify trust boundaries, attacker-controlled inputs, and required attacker capabilities.
3. Map relevant HTTP/API, webhook, upload, redirect, queue, background, admin, database, and third-party entry points.
4. Review only applicable areas using [`references/security-review-checklist.md`](references/security-review-checklist.md).
5. For each candidate issue, trace data and control flow, identify preconditions and impact, and check whether existing controls block exploitation.
6. Reject false positives and distinguish confirmed findings from unverified risks.
7. Classify severity from impact, exploitability, required access, affected scope, data sensitivity, and mitigations.
8. Recommend the smallest complete remediation plus a regression test or validation method.

Never attack production, send exploit traffic to third parties, exfiltrate real secrets, modify production data, disable controls, create persistent backdoors, or run destructive tests. Stop when validation requires production impact or unavailable authorization.

## Verification

Each finding must include affected location, attack scenario, preconditions, observed evidence, security impact, existing mitigation, recommended fix, and validation approach. When exploitability cannot be established, label it an unverified risk rather than a confirmed vulnerability.

## Output

```text
Scope
Assets and trust boundaries
Confirmed findings
Unverified risks
Severity and evidence
Attack scenario
Recommended remediation
Validation
Not reviewed
Remaining risk
```
