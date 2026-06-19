# ADR-0014 — Math & tables (v0.3.3)

**Status:** Accepted  
**Date:** 2026-06-19

## Context

LaTeX authors frequently insert mathematical equations and structured tables. Both tasks involve memorising command syntax, which interrupts writing flow. The goal of v0.3.3 is to let an author insert correct LaTeX for both constructs without leaving the editor and without knowing the syntax off the top of their head.

Two prior constraints shape the design:

1. **100% coverage gate.** Every new branch and function must be exercisable by unit tests running in jsdom. Libraries that rely on browser APIs unavailable in jsdom (e.g. MathLive's canvas-based rendering) must be hidden behind injectable seams.
2. **Svelte 5 runes.** The codebase is fully committed to the Svelte 5 runes API; all new components follow the same patterns established in v0.3.0–v0.3.2.

## Decision

### 1 — MathLive as the equation editor, accessed through an injectable seam

MathLive (`mathlive` npm package) provides a `<math-field>` custom element that renders a WYSIWYG LaTeX input. It is the de-facto standard for in-browser LaTeX editing, ships with accessibility support, and covers the full AMS math vocabulary.

The library is loaded with `void import('mathlive')` (fire-and-forget dynamic import) to register the custom element. The actual DOM interaction is encapsulated in `realMathFieldSetup` (`math-field.ts`), which accepts an `HTMLElement` container and an initial value, appends the `<math-field>` element, and returns a `{ getValue(): string }` handle.

Tests inject a fake `MathFieldSetup` that appends a plain `<input>` and delegates `getValue` to `input.value`. This keeps tests entirely in jsdom without needing `vi.mock('mathlive')` at the `MathEditor` level (only `math-field.test.ts` mocks it, since that test exercises `realMathFieldSetup` directly).

### 2 — Svelte action (`use:mathMount`) instead of `$effect` + `bind:this`

`bind:this` combined with `$effect` produces a null-branch (`if (el !== null) { ... }`) that is structurally uncoverable in unit tests (Svelte always sets the ref before the effect runs, so the null branch is never taken). Wrapping the setup in a Svelte action avoids the null-check entirely: the action node parameter is always a live `HTMLElement`.

The action returns `void` (no `destroy`). There is no cleanup to perform — the container is removed with the component.

### 3 — Definite-assignment assertion for the handle

`let handle!: ReturnType<MathFieldSetup>` uses TypeScript's definite-assignment assertion. The action (`use:mathMount`) runs synchronously during Svelte's mount phase, before any user interaction can reach `confirm()`, so `handle` is always populated by the time it is read. The `!` avoids an optional/null branch that would otherwise be structurally uncoverable.

### 4 — Pure Rust helpers for wrapping and building

`galley-core::math` and `galley-core::table` implement the `wrap_inline`, `wrap_display`, `build_tabular`, and `build_booktabs` functions. Keeping these as pure Rust functions (no I/O, no FFI) allows them to be verified at 100% coverage with trivial unit tests and makes the domain logic available to any future non-desktop surface (CLI, API).

TS mirrors (`math.ts`, `table.ts`) provide the same functions for use in the frontend without a Tauri round-trip. The TS and Rust implementations are independent; correctness is verified by parallel unit tests.

### 5 — `selected={expr}` on `<option>` elements for `<select>` state

Svelte 5 compiles `value={reactiveExpr}` on `<select>` elements into internal runtime calls that produce structural branches in the compiled output (branch counts attributed back to the source line via source maps). These branches cannot be driven to 100% from unit tests without exhaustive value cycling.

Using `selected={expr === value}` on each `<option>` instead produces explicit boolean branches in user-controlled source code, all of which are naturally exercised as long as tests use each alignment and style at least once. This pattern is consistent with `PreviewPane.svelte`'s zoom select.

### 6 — SymbolPalette groups and symbol set

42 symbols across four collapsible groups (Greek 16, Operators 10, Relations 9, Arrows 7) cover the majority of symbols appearing in physics, mathematics, and engineering papers. The accordion starts fully open so the palette is immediately useful on first open. Group state is managed with `Set<string>` to allow `$state`-tracked toggling without per-group boolean variables.

### 7 — TableBuilder column/row constraints

Columns are clamped to 1–8; rows to 1–12. These limits keep the modal usable (a table wider than 8 columns rarely fits on a page) and the grid manageable in the fixed-size panel. The `range(n)` helper avoids the `{#each Array(n) as _, i}` idiom, which triggers `@typescript-eslint/no-unused-vars` for the `_` binding.

## Consequences

- MathLive (~825 kB minified) is lazy-loaded: it is only fetched when the equation editor opens, so it does not affect initial bundle parse time.
- The injectable seam pattern (`MathFieldSetup`) extends the project's existing injectable-backend convention from v0.3.0 and v0.3.2, keeping it consistent.
- `galley-core` now exports `wrap_inline`, `wrap_display`, `build_tabular`, `build_booktabs`, and `Align` — all tested at 100% region/line/function coverage.
- Frontend tests: 578 passing, 100% lines/branches/functions/statements.
