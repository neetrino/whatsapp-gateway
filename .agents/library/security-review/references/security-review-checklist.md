# Security review checklist

- **Identity:** authentication source, session/token lifecycle, recovery, and impersonation paths.
- **Authorization:** route and object checks, tenant isolation, admin boundaries, and default denial.
- **Data boundaries:** sensitive fields, storage, transport, retention, exposure, and cross-tenant access.
- **Inputs:** validation, injection, XSS, CSRF, open redirects, path traversal, and unsafe parsing.
- **Browser security:** cookies, CORS, CSP/headers, postMessage, and client-visible secrets.
- **Server-side requests:** SSRF, destination allowlists, redirects, DNS/private networks, and timeouts.
- **Files:** type/content validation, size limits, names/paths, storage permissions, and active content.
- **Webhooks:** signature verification, replay resistance, idempotency, ordering, and durable handling.
- **Secrets:** source, runtime access, rotation, least privilege, and accidental output.
- **Logging:** token/PII redaction, error leakage, audit events, and safe correlation.
- **Availability:** rate limits, bounded work, retries, resource exhaustion, and abuse paths.
- **Dependencies:** reachable vulnerable behavior, provenance, update path, and compensating controls.
