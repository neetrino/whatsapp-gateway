# Size A (small)

- **When:** ~1–3 months, 1–2 devs, low–medium complexity, no need to scale to many teams.
- **Layout:** `src/app`, `src/components`, `src/lib`, `src/types`; optional `prisma/`.
- **Docs minimum:** `README.md`, `docs/01-ARCHITECTURE.md`, `docs/PROGRESS.md`, `.env.example` (and `docs/02-TECH_STACK.md` or stack section in README).
- **May simplify:** global state library if `useState` enough; tests focused on critical logic; deploy via platform auto-deploy.
- **Do not simplify:** TypeScript strict, validation, ORM/parameterized SQL, secrets via env.
