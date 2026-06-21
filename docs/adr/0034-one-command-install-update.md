# ADR-0034 — One-command install, in-app updates, uninstall (v0.9.2)

**Status:** Accepted  
**Date:** 2026-06-21  
**Deciders:** Achref Soua

---

## Context

Galley should be as easy to live with as a CLI tool: install with one terminal
command, hear about new releases automatically, and uninstall cleanly — the
experience Helio and Quiver offer, with Galley's own typewriter identity.

## Decisions

### 1. A self-contained POSIX/PowerShell installer, published as a release asset

`scripts/install/install.sh` (Linux/macOS) and `install.ps1` (Windows) are
attached to every release, so `curl … | sh` / `irm … | iex` work against a stable
`releases/latest/download/` URL. The shell installer detects the platform,
downloads the AppImage, verifies it against `SHA256SUMS.txt`, installs a `galley`
launcher, and registers a `.desktop` entry + icon. It opens with the struck
**GALLEY** wordmark on a red ribbon platen baseline — the brand, in the terminal.

### 2. The `galley` launcher carries update/uninstall/version

Rather than a separate CLI binary (Galley is a GUI app), the installer generates a
small `galley` wrapper: `galley` launches the app, `galley update` re-runs the
installer, `galley uninstall` removes everything, and `galley version` prints the
recorded version. The installed version is written to `~/.local/lib/galley/version`
so it can be shown on install, update, and uninstall.

### 3. In-app update detection goes through the core process

The webview's strict CSP forbids cross-origin requests, so the launch-time update
check calls a Rust command (`check_latest_release`) that queries the GitHub
releases API and returns the latest tag. The frontend compares it with the running
version (`update-check.ts`) and shows a dismissible banner. The pure comparison and
the backend seam are 100 % covered; the egress stays in the core, consistent with
the §8.4 privacy posture. It is on by default and disable-able in Settings → About
(`PrivacyPrefs.updateChecks`).

### 4. The installer screenshot is rendered from the real script

A colour-forced demo mode (`GALLEY_INSTALL_DEMO=1`) prints a faithful transcript;
`just install-shot` converts its ANSI to HTML and screenshots it to
`docs/assets/install.png`, so the README image can never drift from the installer.

## Consequences

- Users install, update, and remove Galley from one command, with the version
  visible at every step and in the app.
- New releases are surfaced automatically without relaxing the CSP or sending
  telemetry.
- macOS one-command install is best-effort (points at the signed `.dmg`) until a
  notarised build exists; Windows uses the NSIS installer.
