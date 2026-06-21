# ADR-0031 — Packaging, app identity & installers (v0.7.3)

**Status:** Accepted  
**Date:** 2026-06-21  
**Deciders:** Achref Soua

---

## Context

Galley must feel first-class on every desktop: downloaded, installed from a
native installer, shown in the launcher, pinned to the taskbar/Dock/panel with
the double-strike **G**, and able to open an associated `.tex`. The roadmap (§7,
v0.7.3; §4.8) calls for per-OS installers, a finalized icon set, file
associations, signing/notarization wired (enabled when certs exist), SHA-256
checksums, and an optional signed auto-update that is off by default.

GitHub Actions is dormant and the build host is Linux, so installers are built
**locally per OS** with `just package`; the dormant workflow can later build the
full matrix.

## Decisions

### 1. One config builds every native installer per OS

`bundle.targets` is `"all"`, so `just package` produces the full native set for
whatever OS it runs on — Linux `.AppImage`/`.deb`/`.rpm`, Windows `.msi` + NSIS
`.exe`, macOS `.app`/`.dmg`. The bundle metadata (publisher, homepage, category,
`.deb` section, macOS minimum system version, NSIS install mode) is set once.

### 2. The icon set is generated from a single 1024² master

`just icons` runs `tauri icon` against `assets/brand/icon-master.svg` to produce
the Windows `.ico`, macOS `.icns`, Linux hicolor PNGs, and store logos. The mark
is the simple double-strike **G**, legible down to 16 px. Mobile (android/ios)
output is stripped.

### 3. File associations are opt-in editor roles

`.tex` and `.galley` are declared in `bundle.fileAssociations` with the `Editor`
role. The pure `file-assoc.ts` classifies an opened path so the shell can route a
double-clicked file. Associations are offered by the installer, never seized
silently, and are reversible.

### 4. Signing, notarization, and the updater are wired but dormant

Signing/notarization stay no-ops (`just sign`) until certificates exist — exactly
the existing posture. The optional Tauri updater is **off by default**; its UI
side is the pure `update-check.ts` (does a newer release exist?), so a skippable
"update available" prompt can be built without enabling downloads. Turning the
updater on is a key-and-config flip, documented in `docs/packaging.md`, not a code
change. Every release publishes `SHA256SUMS.txt` (`just checksums`) regardless.

## Consequences

- A single `just package` yields the right installers on each OS; `just
checksums` makes them verifiable.
- The app carries a consistent identity (icon, publisher, associations) across
  platforms.
- Signing and auto-update can be switched on later without touching code.
- macOS and Windows installers must be built on those OSes (or via the dormant
  CI matrix); the Linux installers are built here. This is a host limitation,
  recorded honestly rather than worked around.
