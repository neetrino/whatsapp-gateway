# Size B (medium)

- **When:** ~3–6 months, small team, many features, possible separate API later.
- **Layout:** `src/features/*` (components, hooks, services, `types`, `index` barrel), `src/shared/*`, `src/config`; `tests/` as needed.
- **Docs:** add `03-STRUCTURE`, `04-API`, `05-DATABASE`, `DECISIONS`, `CHANGELOG` as the project grows.
- **Rules:** import features via **public barrels** (`@/features/x`); **no** `shared` importing from `features`.
- **Testing:** unit for domain/services; integration for API routes; e2e for critical flows.
