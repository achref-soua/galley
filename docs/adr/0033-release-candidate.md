# ADR-0033 — Release candidate (v0.9.0)

**Status:** Accepted  
**Date:** 2026-06-21  
**Deciders:** Achref Soua

---

## Context

v0.9.0 is the release candidate (§7): API/UX stabilization, a complete user guide
plus install and migration docs, and a recorded performance & security sign-off.
The acceptance bar is zero known P0/P1, complete docs, sign-offs recorded, and the
suite green at 100 % coverage.

## Decisions

### 1. The RC is a documentation and sign-off milestone, not a feature drop

Following the v0.8.0 feature freeze, v0.9.0 adds no product surface. It completes
the documentation (`docs/user-guide.md`, `docs/migration.md`) and records a
release-readiness sign-off (`docs/release-readiness.md`) that states plainly what
is verified and what is pending real hardware or a non-Linux build.

### 2. Sign-off is honest about pending items

The quality gate, security posture, and the bundle budget are verified. Runtime
performance numbers (cold start, idle RAM, recompile) and the Windows/macOS
installers are explicitly marked pending — they require reference hardware and
those OSes respectively, and are never fabricated. This keeps the RC trustworthy.

### 3. The manual QA pass follows the RC

A full real-user QA pass runs after this release; any P0/P1 findings are fixed
before v1.0.0. The criteria for v1.0.0 are listed in `docs/release-readiness.md`.

## Consequences

- A reviewer can read one guide to understand every feature and one page to see
  exactly what has been verified.
- The path to v1.0.0 is explicit and measurable.
- No code changed, so the suite remains green at 100 % coverage.
