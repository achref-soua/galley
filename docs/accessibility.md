# Accessibility

Galley aims to be usable by everyone — at high contrast, by keyboard, and with a
screen reader. This page records what ships and how it is verified.

## Themes & contrast

Four themes ship, all built from one token system and selected by a single
`data-theme` flip:

- **Onionskin** — light, the freshly-typed sheet.
- **Carbon** — dark, the carbon-copy.
- **Onionskin High-Contrast** — maximum-contrast light.
- **Carbon High-Contrast** — maximum-contrast dark.

Every text/background pairing is checked against WCAG by the palette-contrast
tests, which parse the _shipped_ token CSS and resolve `var(--…)` chains to real
hex values. Targets: primary text on the base clears **AAA (7:1)**; text on
surfaces and muted text clear **AA (4.5:1)**; large/UI tokens clear **3:1**. The
high-contrast variants exceed these comfortably (most pairings clear AAA).

Pick a theme in **Settings → Appearance**. The choice persists; the first run
follows the OS colour scheme.

## Keyboard navigation

Core flows are reachable without a mouse: the command palette opens every action,
dialogs trap focus and close on `Escape`, and interactive controls expose roles
and labels. The first-run tour is fully keyboard-navigable (Tab between Skip /
Back / Next, `Escape` to dismiss). The `focus-trap.ts` helper provides the
wrap-around math dialogs use to keep focus inside the modal.

## Screen readers

Dialogs are `role="dialog"` with `aria-modal` and an accessible name; buttons and
toggles carry `aria-label` / `aria-pressed` / `aria-checked`; status regions use
`role="status"` / `aria-live` so compile and import progress are announced.

## Reduced motion

The mechanical motion (carriage slides, the platen settle) is disabled when the
OS requests reduced motion, and can be turned off in **Settings → Appearance**.
