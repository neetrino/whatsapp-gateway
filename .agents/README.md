# Agent system

This directory contains reusable AI workflows and documentation for maintaining the repository's Agent system.

- [`skills/`](skills/) — active task workflows for AI agents.
- [`catalog/`](catalog/) — Skill registry, composable profiles, and external source provenance.
- [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — Rules, Skills, and References architecture.
- [`system/SKILL_AUTHORING_GUIDE.md`](system/SKILL_AUTHORING_GUIDE.md) — standards for creating and maintaining Skills.
- [`system/SKILL_TRIGGER_TESTS.md`](system/SKILL_TRIGGER_TESTS.md) — positive and negative routing examples.

```text
Product documentation
→ docs/

Cursor-specific coding rules
→ .cursor/rules/

Portable Agent Skills
→ .agents/skills/

Curated Skill metadata and profiles
→ .agents/catalog/

Curated inactive Skills
→ .agents/library/

Agent-system architecture and governance
→ .agents/system/
```

Profile membership describes desired project composition. A package under `library/` remains inactive and undiscoverable until a future installer explicitly activates it.

Current library packages:

- `code-review` — internal.
- `security-review` — internal.
- `react-performance-review` — internal.
- `ui-accessibility-review` — external-adapted with pinned provenance.
