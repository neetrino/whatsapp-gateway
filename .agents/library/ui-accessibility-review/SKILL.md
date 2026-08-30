---
name: ui-accessibility-review
description: Review frontend interfaces for accessibility, semantic structure, keyboard support, focus behavior, form usability, responsive interaction, locale-aware content and high-impact UX risks. Use when the user requests an accessibility audit, UI review, UX review, form usability assessment or interface best-practice review. Do not use for ordinary UI implementation, isolated visual changes, Figma pixel-parity work or dedicated React performance analysis.
---

# UI accessibility review

## Purpose

Adapt reviewed Web Interface Guidelines into a portable, project-aware review workflow. Retain broadly applicable accessibility and high-impact usability principles without making Vercel-specific preferences universal.

## Finding classes

Separate accessibility violations, high-impact usability risks, responsive/interaction risks, localization/content risks, and design preferences. Never report a preference as an accessibility failure.

## Use when

Use for accessibility, UI, UX, form usability, keyboard/focus, responsive/mobile interaction, design-system quality, and frontend best-practice reviews.

## Do not use when

Do not use for ordinary UI implementation, text/CSS/visual adjustments, Figma parity, React performance investigation, or generic completion checks. Use `figma-to-production`, `react-performance-review`, or `verify-before-completion` respectively.

## Inputs

Inspect target pages/components and critical flows, supported devices/languages/browsers, design system, accessibility requirements, project Rules, and TECH_CARD decisions.

## Workflow

1. **Establish scope.** Identify flows, desktop/mobile targets, input methods, languages, and design constraints.
2. **Review semantics.** Inspect landmarks, headings, buttons, links, labels, tables, lists, native controls, and custom widgets. Prefer native HTML before ARIA.
3. **Review keyboard operation.** Check reachability, tab order, activation, traps, Escape, and applicable arrow-key behavior without duplicating native behavior.
4. **Review focus.** Check visible focus, movement, dialog/drawer lifecycle, validation errors, route changes, and restoration.
5. **Review controls and forms.** Inspect labels/names, descriptions, input type/mode, autocomplete by purpose, validation, errors, first-invalid focus, submission/loading, password managers, and paste behavior.
6. **Review overlays and widgets.** Check naming, keyboard model, containment when appropriate, restoration, dismissal, and screen-reader state for dialogs, menus, comboboxes, tabs, accordions, tooltips, popovers, and custom selects.
7. **Review responsive and touch behavior.** Inspect target size against project standards, zoom, safe areas, mobile keyboard, overflow, fixed elements, viewport changes, touch, and hover-only interaction.
8. **Review UI states.** Inspect loading, empty, error, disabled, success, offline, permission-denied, and destructive-confirmation states.
9. **Review motion.** Check reduced-motion support, interruptibility, discomfort risk, layout-triggering animation, and transition scope.
10. **Review localization.** Check `Intl` formatting, dates/numbers/currency, expansion, RTL when required, wrapping, and locale-specific content. Do not impose English typography or copy rules on other languages.
11. **Review navigation state.** Persist filters/search/tabs/pagination/sort/resource state only when meaningfully shareable, bookmarkable, refresh-restorable, or expected in Back/Forward. Keep ephemeral state local.
12. **Review images/content robustness.** Check alt/decorative treatment, dimensions/stability, appropriate lazy loading, long/empty/user content, and framework image tooling.
13. **Validate runtime when available.** Test keyboard, focus, accessibility tree, critical forms, relevant mobile viewport and states, and console. Otherwise label “Static source review only.”

Use [`references/ui-accessibility-checklist.md`](references/ui-accessibility-checklist.md) for a concise pass.

## Verification

Every finding includes class, location, observed behavior, user impact, evidence, correction, and validation method. Distinguish confirmed issues, likely risks, runtime-unverified concerns, and preferences; never present speculation as confirmed.

## Output

```text
Reviewed scope
Accessibility violations
High-impact usability risks
Responsive and interaction risks
Localization and content risks
Design preferences
Evidence
Recommended corrections
Runtime checks
Not verified
Remaining risk
```

Omit empty sections.
