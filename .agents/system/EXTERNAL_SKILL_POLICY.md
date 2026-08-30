# External Skill intake policy

## Purpose

Protect projects from malicious instructions, dangerous scripts, stale workflows, hidden production actions, conflicts with existing Rules, unreviewed secret access, and licensing problems.

## Intake stages

```text
1. Discovery
2. Source verification
3. Content review
4. Script review
5. Security review
6. Compatibility review
7. Duplication review
8. Adaptation
9. Trigger testing
10. Acceptance
11. Catalog registration
12. Library installation
```

## Required review

For every external Skill, verify:

- repository owner, repository URL, immutable commit SHA, and source path;
- license, license review, and last meaningful update;
- `SKILL.md`, `references/`, `scripts/`, and `assets/`;
- shell commands, network access, secret access, and filesystem writes;
- Git, deployment, database, and production operations;
- conflicts with Rules and overlap with existing Skills;
- trigger and non-trigger quality;
- verification guidance and output contract.

## Automatic rejection

Do not accept a Skill without an explicit additional decision when it:

- performs production deployment automatically;
- runs destructive database commands;
- runs `git reset --hard` or `git clean -fd`;
- sends code, secrets, or data to unknown services;
- requires disabling security controls;
- hides errors or removes tests to pass CI;
- contains obfuscated scripts;
- lacks clear provenance or a resolvable license;
- duplicates an existing Skill without material benefit.

## Adaptation policy

If an external Skill is materially changed, set its catalog origin to `external-adapted` and record:

- what changed and why;
- which potentially dangerous actions were removed;
- which Rules-Template requirements were added.

Use `external-vendored` only when the accepted package remains materially faithful to the reviewed source.

Accepted external packages require `licenseReviewed: true`, exact applicable source license text in `LICENSE.source.txt`, and deterministic provenance fields in `SOURCE.md` that match Source Lock. Adapted sources require meaningful `adaptationNotes`.

Reviewing a source for research does not require Source Lock registration when no content, files, examples, or taxonomy are copied or materially adapted. The research decision must still be recorded, and this exception does not relax license requirements for any external content that enters a package.

## No direct installation

External Skills must not be copied directly into `.agents/skills/` before review and catalog registration. Accepted external Skills enter `.agents/library/` first unless activation is separately justified.
