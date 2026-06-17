# ADR-0004: The UI kit as a tested component library

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

`@galley/ui-kit` started (v0.0.1) as a single `tokens.css`. From v0.0.2 it also
owns the shared Svelte primitives (Logo, Wordmark, Button, IconButton, Toggle,
SegmentedControl, Panel, Icon) and pure helpers (theme metadata, layout model,
contrast). The 100%-coverage mandate (ADR-0002) applies to every package, and the
coverage run in v0.0.1 only exercised `@galley/desktop`. We need the UI kit to be
consumable by the app and held to the same coverage bar, and the deliverables call
for Storybook.

## Decision

**`@galley/ui-kit` is a source-distributed Svelte component library with its own
100%-coverage test suite, consumed by the desktop app as a workspace dependency.**

- The package exports Svelte source (not a pre-built bundle): `exports["."]` and a
  top-level `svelte` field both point at `src/index.ts`, so the consuming app's
  Vite/Svelte pipeline compiles the components and tree-shakes them. The desktop
  app declares `@galley/ui-kit: workspace:*` and inlines it in Vitest
  (`server.deps.inline`) so the test runner transforms the `.svelte` sources.
- The kit has its own `vitest` + v8 coverage config gated at 100% lines, branches,
  functions, and statements (matching the desktop app), and `scripts/ci/cover.sh`
  runs both suites. Components are exercised with `@testing-library/svelte`.
- **Storybook** (`@storybook/svelte-vite`) documents the primitives. Stories
  (`*.stories.svelte`) are development tooling, not tests: they are excluded from
  the coverage run and Storybook is **not** part of `just ci` (it has no headless
  build step in the gate), consistent with the bootstrap-exclusion reasoning in
  ADR-0002.
- A practical coverage rule learned here: Svelte's `class="x {dynamic}"` and
  `style="…{dynamic}…"` interpolations compile to a `?? ''` fallback whose branch
  is unreachable when the value is never nullish. Prefer `class:` directives and a
  pre-computed `$derived` bound as a whole `style={…}` expression, so coverage
  stays honest without contrived "pass null" tests.

## Consequences

- The design system is reusable and independently testable, and both packages
  meet the same hard coverage gate before any merge.
- Storybook stays available for visual development without slowing or gating CI.
- Adding a primitive means adding its component, its barrel export, its tests, and
  (optionally) a story — a clear, repeatable shape.
