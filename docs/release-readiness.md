# Release readiness (v0.9.0 RC)

This is the release-candidate sign-off: what is verified, what is pending real
hardware, and the criteria for cutting v1.0.0. Nothing here is fabricated — items
that need a measurement on reference hardware or a non-Linux build are marked
pending, not claimed.

## Quality gate — ✅ verified

- **Tests & coverage** — `just ci` is green. Rust: 100 % line / region / function
  coverage. Frontend: 100 % line / branch / function / statement coverage across
  the desktop app and the UI kit. No coverage exclusions beyond the bootstrap
  entry (`main.ts`, ADR-0002).
- **Lint & format** — `clippy -D warnings` and ESLint clean; `cargo fmt` and
  Prettier enforced.
- **Supply chain** — `cargo audit` and `pnpm audit` report no known
  vulnerabilities.
- **Docs gate** — README, CHANGELOG, SECURITY, CONTRIBUTING, LICENSE present;
  CHANGELOG carries the release entry.

## Security sign-off — ✅ verified (see SECURITY.md, threat model)

- Compile sandbox: shell-escape off by default; embedded Tectonic cannot execute
  it. Pre-compile scanner (`galley-core::sandbox`).
- Input confinement: `\input` traversal blocked; the file store refuses absolute
  paths, `..`, and escaping symlinks.
- Archive hardening: zip-slip / absolute-path / null-byte / drive-letter / symlink
  / size / file-count guards on import.
- Secrets: API keys in the OS keychain, never logged or committed.
- Config parsed, never executed (`latexmkrc`).
- Update integrity and signing: wired, enabled when certificates exist; checksums
  always published.

## Performance — ✅ budgets defined & bundle measured / ⏳ runtime numbers pending HW

- Budgets are declared in code (`galley-core::perf`, `perf-budget.ts`) and the UI
  bundle-size gate runs every `just ci` (current bundle ~600 KiB of a 1536 KiB
  budget). See [performance](performance.md).
- ⏳ **Cold-start, idle-RAM, and recompile timings** are measured by hand on the
  low-spec reference machine; the numbers are recorded in `performance.md` when
  measured on real hardware, not fabricated here.

## Packaging — ✅ Linux built / ⏳ Windows & macOS pending those OSes

- `bundle.targets: "all"` builds each OS's full installer set. Linux
  (`.AppImage`/`.deb`/`.rpm`) builds on the development host.
- ⏳ **Windows (`.msi`/NSIS) and macOS (`.dmg`)** installers must be built on those
  OSes (or via the dormant CI matrix); GitHub Actions is dormant for now.

## Open issues

- No known P0/P1 defects in the tested surface. A full manual real-user QA pass
  follows this RC; any findings are fixed before v1.0.0.

## Criteria for v1.0.0

1. The manual QA pass is complete and all P0/P1 findings are fixed.
2. Windows and macOS installers are built and verified on those OSes.
3. Reference-hardware performance numbers are captured into `performance.md`.
4. Screenshots and a demo recording are published and current.
5. `just ci` remains green at 100 % coverage.
