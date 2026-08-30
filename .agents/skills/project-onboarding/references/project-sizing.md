# Project size decision

Open this reference while onboarding a project whose size is not set, or when the team explicitly asks to revisit the selected size.

## Criteria (rule of thumb)

| Size | Timeline | Team | Features (rough) | Layout |
|------|----------|------|-------------------|--------|
| **A** | 1–3 mo | 1–2 | ~5–15 | Simple (`app`, `components`, `lib`) |
| **B** | 3–6 mo | 2–5 | ~15–50 | Feature-based (`features/*`, `shared/*`) |
| **C** | 6+ mo | 5+ | 50+ | Monorepo (`apps/*`, `packages/*`) |

## Proposal format

State: timeline, complexity, feature count → recommended **A/B/C** + **folder layout** + short rationale → **wait for confirmation**.

## After approval

Record the approved size and layout in `docs/TECH_CARD.md`. Update it if the team later approves a different size.

Details, examples, architectural recommendations, and constraints:

- [`project-sizes/size-a-small.md`](project-sizes/size-a-small.md)
- [`project-sizes/size-b-medium.md`](project-sizes/size-b-medium.md)
- [`project-sizes/size-c-large.md`](project-sizes/size-c-large.md)
