# ADR-0030 — Accessibility, i18n, themes & onboarding (v0.7.2)

**Status:** Accepted  
**Date:** 2026-06-21  
**Deciders:** Achref Soua

---

## Context

Before the beta, Galley needs to be usable by everyone: legible at high contrast,
navigable by keyboard and screen reader, translatable, and welcoming on first run.
The brand (§2.4) calls for four themes — Onionskin and Carbon, each with a
high-contrast variant — and the roadmap (§7, v0.7.2) adds localization
scaffolding and an in-voice onboarding tour.

---

## Decisions

### 1. High-contrast is two more `data-theme` values, not a separate axis

The CSS theme system repaints the whole app from a single `data-theme` flip.
Rather than add an orthogonal `data-contrast` attribute, the high-contrast
variants are two additional concrete themes (`onionskin-hc`, `carbon-hc`). This
keeps the painting model unchanged, fits §2.4's "four themes" framing, and lets
the existing palette-contrast test cover them by simply adding two rows.

Every HC pairing is verified against WCAG: base text/background clears AAA (7:1),
surfaces and muted text clear AA (4.5:1), and large/UI tokens clear 3:1 — checked
against the _shipped_ token CSS so the palette can never drift below the floor.

### 2. Localization is a small, pure scaffolding — English first

`i18n.ts` is a dependency-free catalog + translator: dot-keyed messages, `{named}`
interpolation, and English fallback. Strings are externalised into
`locales/en.ts`. The onboarding tour is the first fully-localised surface; other
surfaces adopt `t()` incrementally. Keeping it pure means it tests to 100 % and
adds no runtime weight. A reactive Svelte locale switch and additional locales are
deferred — the scaffolding is what v0.7.2 commits to.

### 3. Onboarding is first-run only, modelled purely, rendered thinly

The tour's steps, copy keys, first-run persistence, and navigation live in
`onboarding.ts` (pure, tested); `OnboardingTour.svelte` only renders and drives
them. The app shows it when the `galley:onboarded` flag is absent (read in
`main.ts`, which is excluded from coverage); closing it sets the flag. The
`App` component takes an `onboarded` prop defaulting to `true`, so the entire
existing test suite is unaffected and the first-run branch is covered explicitly.

### 4. A pure focus-trap helper for modal keyboard navigation

`focus-trap.ts::nextFocusIndex` computes where Tab / Shift+Tab should wrap inside
a dialog. The math is pure and tested; components perform the actual `focus()`.

---

## Consequences

- Low-vision users get AA/AAA themes verified on every build.
- The UI is translatable without touching components; English ships today.
- New users get an in-voice, keyboard-navigable welcome that points at the
  Overleaf-import path, shown once.
- Modal keyboard wrapping has a tested primitive ready to adopt across dialogs.
