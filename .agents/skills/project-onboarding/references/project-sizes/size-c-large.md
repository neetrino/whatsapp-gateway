# Size C (large)

- **When:** 6+ months, multiple teams, many features, scaling and clear module boundaries required.
- **Layout:** `apps/web`, `apps/api` (Nest or agreed backend), optional `apps/admin`; `packages/ui`, `packages/domain`, `packages/shared`, `packages/contracts`, shared `config` tooling.
- **Boundaries:** `domain` stays free of framework imports; apps depend on packages, not the reverse; document allowed dependency graph in `docs/architecture/`.
- **Docs:** ADRs for major decisions; API contracts (OpenAPI/events); guides for setup/deploy/contributing.
- **Tooling:** use the approved workspace/build tooling; run affected pipelines when supported.
- **Testing:** high coverage on `domain`; integration for APIs; e2e for critical user journeys.
