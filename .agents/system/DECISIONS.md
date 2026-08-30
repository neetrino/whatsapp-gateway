# Agent system decisions

## D-001 — Separate product documentation and Agent-system governance

Status: accepted

Context: Product documentation and Agent-system governance serve different readers and lifecycles.

Decision: Store product documentation under `docs/` and Agent-system architecture and governance under `.agents/system/`.

Consequences: Product templates remain uncluttered; Agent governance has an isolated validation scope.

## D-002 — Use `.agents/skills/` as the canonical active Skill directory

Status: accepted

Context: Cursor and Codex need one portable source for active workflows.

Decision: Store active Skills in `.agents/skills/`; do not maintain full duplicates in `.cursor/skills/`.

Consequences: Skill behavior has one active source of truth.

## D-003 — Use `.agents/library/` for curated inactive Skill packages

Status: accepted

Context: Curated Skills may be useful without being appropriate for every project.

Decision: Store accepted inactive Skills in `.agents/library/`, outside agent discovery.

Consequences: The directory is created only when a real library Skill exists.

## D-004 — Use JSON as the machine-readable catalog format

Status: accepted

Context: Catalog data must be deterministic and readable by Node.js without dependencies.

Decision: Use `catalog.json`, `profiles.json`, and `sources.lock.json`; do not use Markdown as the machine source of truth.

Consequences: Validation and future installation can use the Node.js standard library.

## D-005 — Keep Skill behavior in SKILL.md and metadata in catalog.json

Status: accepted

Context: Duplicated workflow text would drift and waste context.

Decision: Keep behavior and instructions in `SKILL.md`; keep registry metadata in `catalog.json`.

Consequences: Catalog entries stay compact and machine-oriented.

## D-006 — Require immutable provenance for external Skills

Status: accepted

Context: External instructions and scripts introduce security, maintenance, and licensing risk.

Decision: Record repository, immutable commit, source path, license review, review date, and adaptation status for every accepted external Skill.

Consequences: External Skills cannot enter the curated library without a reviewable source lock.

## D-007 — Use composable Skill profiles

Status: accepted

Context: Repeating complete Skill lists across project types causes drift.

Decision: Compose profiles through `extends` and keep only profile-specific Skills in direct lists.

Consequences: Resolved Skill sets are deduplicated while profile intent remains clear.

## D-008 — Curated Skills enter library before activation

Status: accepted

Context: Newly accepted workflows should not become project instructions automatically.

Decision: Add new curated Skills to `.agents/library/` before any project activation.

Consequences: Review and catalog registration remain separate from discoverability.

## D-009 — External adaptations use local references

Status: accepted

Context: Runtime remote prompt fetching can drift away from reviewed content.

Decision: Bundle stable reviewed references locally for external-adapted Skills instead of fetching floating instructions at runtime.

Consequences: Adapted packages are reproducible and remain tied to immutable provenance.

## D-010 — Profiles describe desired composition

Status: accepted

Context: Profiles need to describe active and curated inactive workflows before an installer exists.

Decision: Profiles may reference active and library Skills; membership does not activate a library package.

Consequences: Profile resolution must expose package state and reject deprecated Skills.

## D-011 — Unlicensed candidates may inform research but not implementation content

Status: accepted

Context: A useful external candidate may lack the exact applicable license text required for copying or adaptation.

Decision: Record the research outcome, but implement only an independently authored internal workflow when no external content, files, examples, or taxonomy are copied or materially adapted.

Consequences: Research remains auditable without weakening licensing requirements or creating a Source Lock dependency.

## D-012 — Research-only references are not provenance dependencies

Status: accepted

Context: Secondary sources may help evaluate a workflow while contributing no content to the accepted package.

Decision: Require Source Lock provenance only for sources whose content is copied or materially adapted. Record research-only sources in evaluation notes instead.

Consequences: Provenance stays precise while external-adapted packages remain tied only to their actual content sources.
