---
name: figma-to-production
description: Implement production-ready frontend UI from Figma designs or design specifications while reusing the existing design system and verifying visual behavior. Use for Figma-to-code work, screen implementation, component implementation and visual parity tasks. Do not use for small isolated copy edits or simple styling changes that do not require design analysis.
---

# Figma to production

## Purpose

Translate design intent into maintainable, accessible, responsive UI that fits the existing application and is verified against the source.

## Use when

Use for screens, components, or visual-parity work driven by Figma, screenshots, or detailed design specifications.

## Do not use when

Do not use for isolated copy edits or simple styling requests that require no design analysis.

## Inputs

Use the available Figma integration or URL, screenshots, written specifications, assets, target routes, and current application/design-system implementation. State when the design source cannot be inspected directly.

## Workflow

1. Identify and inspect the available design source.
2. Inspect the current application structure, framework, styling approach, tokens, typography, colors, spacing, breakpoints, primitives, components, and layout system.
3. Map design elements to existing implementation and prefer reuse; do not create a parallel design system.
4. Identify unclear, missing, responsive, loading, empty, error, focus, and interaction states. Resolve material ambiguity before inventing product behavior.
5. Implement semantic structure, responsive behavior, accessibility, and relevant UI states using project conventions.
6. Avoid blindly copied generated markup, scattered arbitrary values, duplicate primitives, unrelated page changes, and absolute positioning for normal layout without a design reason.
7. Run the application and verify the actual rendered output when browser or screenshot tools are available.
8. Compare hierarchy, layout, spacing, dimensions, alignment, typography, color, borders, radius, content behavior, and responsive states using [`references/visual-verification.md`](references/visual-verification.md).
9. Fix meaningful differences and run the repository's relevant code validation.

## Verification

Record the viewport and state actually compared. Do not claim pixel-perfect parity without a visual comparison. When rendering tools are unavailable, report visual verification as not run.

## Stop conditions

Stop when required design access or assets are missing, a product decision is materially ambiguous, or implementation would require an unapproved design-system or architecture change.

## Output

```text
Design source
Reused primitives
Implemented scope
Visual checks
Code checks
Not verified
Remaining differences or risk
```
