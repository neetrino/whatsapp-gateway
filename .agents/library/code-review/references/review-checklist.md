# Code review checklist

## Severity

- **Critical:** immediate data loss, broad compromise, or system-wide failure likely without correction.
- **High:** serious correctness, security, or compatibility defect affecting important users or data.
- **Medium:** concrete defect or regression with bounded impact or workaround.
- **Low:** smaller correctness, resilience, or maintainability issue worth fixing; never use for pure preference.

## Review areas

- **Requirements:** approved behavior implemented; no required flow omitted.
- **Correctness:** branches, boundaries, null/empty cases, ordering, and lifecycle behavior.
- **Data integrity:** atomicity, migrations, destructive behavior, validation, and idempotency.
- **Security and authorization:** trust boundaries, object access, secret handling, unsafe input.
- **API compatibility:** public types, status/error contracts, events, and backward compatibility.
- **Error handling:** failures remain observable, safe, and actionable.
- **Concurrency:** races, stale state, retries, duplicate work, and cancellation.
- **Performance:** unbounded work, N+1 behavior, waterfalls, excessive payloads or bundles.
- **Tests:** meaningful regression coverage and realistic failure cases.
- **Maintainability:** ownership, cohesion, duplication, and unnecessary abstraction.
- **Scope:** no unrelated behavior, architecture, or dependency changes.
