# ADR-0003: Design tokens and theming

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

Galley ships two first-class themes — Onionskin (light) and Carbon (dark) — and
will add high-contrast variants later. The themes must cover the whole app, the
editor syntax colours, and the PDF-viewer chrome, switch instantly, and keep the
typewriter brand legible (WCAG-compliant contrast). We need a token architecture
that makes "switch the theme" a single, cheap operation and makes contrast
something we can test rather than eyeball.

## Decision

**A two-layer CSS custom-property system, applied via a `data-theme` attribute on
the document element.**

- **Primitives** (`tokens.css`): the raw, theme-independent values — the seven
  ribbon-palette colours (plus one derived `--ribbon-bright` for accent text on
  dark), and the type, spacing, radius, and motion scales. Components never read
  these directly.
- **Semantic tokens** (`themes.css`): role tokens (`--bg`, `--surface`, `--fg`,
  `--fg-muted`, `--accent`, `--accent-fg`, …) defined once per theme under
  `:root, [data-theme='onionskin']` and `[data-theme='carbon']`. Components read
  only these, so flipping `data-theme` on `<html>` repaints everything at once.
- **Syntax theme** (`syntax.css`): per-theme `--syn-*` colours for LaTeX
  highlighting, so the future CodeMirror 6 editor is themed in lockstep with the
  chrome.
- The whole set is bundled as `@galley/ui-kit/styles.css` (tokens → themes →
  syntax → base reset), which also carries the `prefers-reduced-motion` rule that
  disables transitions and animations globally.
- **Resolution & persistence** live in a small `ThemeController` in the desktop
  app: it reads the persisted preference (or defaults to `system`), resolves it
  against `prefers-color-scheme`, paints `data-theme`, and keeps following the OS
  while the preference is `system`. The pure resolution logic (`resolveTheme`,
  the preference types and guards) lives in `@galley/ui-kit`.
- **Contrast is tested, not assumed.** A unit test parses the shipped token CSS,
  resolves the `var()` chains, and asserts each text/background pairing clears its
  WCAG target (AAA for body text, AA for secondary and accent text, the large/UI
  minimum for faint and success colours) in both themes.

## Consequences

- Theme switching is a single attribute write with no per-component bookkeeping.
- The brand palette cannot silently regress below legibility — the build fails if
  a token change drops a pairing under its contrast target.
- The `--ribbon-bright` accent for dark mode is a deliberate, documented extension
  of the seven-colour palette: the full ribbon is too dark to read as small text
  on Carbon, so the semantic layer substitutes the lifted tint there.
- High-contrast themes (v0.7.2) slot in as two more `data-theme` blocks with no
  component changes.
