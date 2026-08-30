# UI accessibility checklist

- **Semantics:** landmarks, headings, native elements, lists, tables, and meaningful structure.
- **Keyboard:** reachability, logical order, activation, Escape/arrows where applicable, and no traps.
- **Focus:** visible indication, movement, containment when needed, restoration, and error focus.
- **Forms:** labels, descriptions, input purpose, autocomplete context, validation, errors, submission, and paste/password-manager behavior.
- **Accessible names:** visible labels first; correct `aria-labelledby`/`aria-label`; hide decorative content appropriately.
- **Dialogs and overlays:** name, focus lifecycle, dismissal, background behavior, and screen-reader state.
- **Custom widgets:** follow established keyboard/state patterns or prefer native controls.
- **Responsive and touch:** zoom, overflow, safe areas, target usability, mobile keyboard, and no hover-only flows.
- **Motion:** reduced alternative, interruptibility, scoped transitions, and no unnecessary layout animation.
- **Content states:** loading, empty, error, offline, disabled, success, permissions, and destructive confirmation.
- **Localization:** `Intl`, expansion, wrapping, RTL when required, and language-appropriate content rules.
- **Navigation and URL state:** persist only meaningful shareable/restorable navigation state.
- **Images:** useful alt text, decorative handling, stable dimensions, and appropriate loading behavior.
- **Tables:** headers/associations, caption or context, responsive access, and keyboard-compatible interaction.
