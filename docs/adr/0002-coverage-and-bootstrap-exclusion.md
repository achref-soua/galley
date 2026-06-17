# ADR-0002: Coverage policy and the bootstrap exclusion

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

Galley requires **100% test coverage before any PR merges**. Two realities complicate a
naive "100% of everything" rule: GUI bootstrap code (the OS event loop, the DOM mount) is
not meaningfully unit-testable, and stable Rust's `llvm-cov` does not emit branch coverage.

## Decision

**Coverage is enforced at 100%, with exactly one category of justified exclusion: GUI
bootstrap glue.**

- **Rust** (`cargo llvm-cov`) is gated at **100% lines, regions, and functions**. Branch
  coverage is not produced by stable `llvm-cov`, so it is not gated on the Rust side.
- **Frontend** (`vitest` + v8) is gated at **100% lines, branches, functions, and
  statements** — this carries the branch-coverage requirement for the project.
- **The only excluded code is bootstrap glue**, which contains no business logic:
  - the Tauri shell `apps/desktop/src-tauri/src/{main,lib}.rs` — it builds the app and hands
    off to the OS event loop. It is a separate Cargo workspace and is not part of the
    coverage run.
  - the frontend mount entry `apps/desktop/src/main.ts` — excluded via the vitest
    `coverage.exclude` list.
- All real logic lives in covered code: the pure `galley-core` crate (and future crates) and
  the frontend `src/lib` modules and Svelte components, the latter exercised via
  `@testing-library/svelte` mount tests.

End-to-end tests (Playwright) cover critical flows and run as a separate step (`just e2e`);
they sit on top of, not in place of, the unit/component coverage gate.

## Consequences

- The coverage gate is honest: no `#[allow]`/ignore pragmas sprinkled through logic code,
  just two clearly-bounded bootstrap entry points documented here.
- Keeping the Tauri shell logic-free (window setup only) is a deliberate constraint; anything
  with behavior must move into a covered crate.
