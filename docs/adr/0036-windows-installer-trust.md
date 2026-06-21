# ADR-0036 — Windows installer trust: embed WebView2, prefer the MSI (v0.9.5)

**Status:** Accepted  
**Date:** 2026-06-21  
**Deciders:** Achref Soua

---

## Context

The first real Windows install of v0.9.4 was blocked by Windows Defender, which flagged the NSIS
`Galley_…_x64-setup.exe` as a Trojan and refused to run it. The installer is unsigned and brand-new,
so it has no SmartScreen reputation; on top of that, Tauri's default `webviewInstallMode` is
`downloadBootstrapper`, which makes the NSIS installer a _downloader_ — exactly the behaviour
Defender's machine-learning heuristics flag as `Trojan:Win32/Wacatac`-style malware. The result is a
false positive that stops the one-command install dead.

We do not yet have a code-signing certificate (an OV/EV cert is the only permanent fix), so the
decision is about the best cert-free mitigations.

## Decisions

### 1. Embed the WebView2 runtime (`webviewInstallMode: offlineInstaller`)

`apps/desktop/src-tauri/tauri.conf.json` now sets
`bundle.windows.webviewInstallMode = { type: "offlineInstaller" }`. The installer carries the full
WebView2 evergreen runtime instead of downloading a bootstrapper at install time. It is larger, but
it is self-contained and performs no network activity during install — removing the single biggest
trigger for the "downloader" malware heuristic.

### 2. The one-liner installs the MSI, not the NSIS `.exe`

`scripts/install/install.ps1` now downloads `Galley_<version>_x64_en-US.msi` and installs it through
`msiexec`, falling back to the NSIS `.exe` only when no MSI is published. WiX MSIs are flagged by
Defender far less often than unsigned NSIS executables, and `msiexec` is a trusted, well-understood
install path. The checksum check works against whichever asset is chosen.

### 3. Fail loudly and helpfully when Windows still blocks it

If Defender or SmartScreen blocks the install anyway, the script no longer dies with a raw
`Start-Process` exception. It prints what happened (an unsigned-installer false positive), where the
SHA-256-verified file is, and the three ways forward: allow the item under **Windows Security →
Protection history**, run the verified file manually (**More info → Run anyway**), or report the
false positive to Microsoft.

## Consequences

- The Windows one-liner is much more likely to install cleanly, and when it does not, the user is
  told exactly how to proceed instead of hitting a dead end.
- The installer is larger (the embedded WebView2 runtime), which is an acceptable trade for trust.
- This is a mitigation, not a cure: an unsigned installer can still be flagged. Code signing remains
  the permanent fix and is on the roadmap; the README and `docs/install.md` say so plainly.
- No application code changed, so coverage and the test suites are unaffected.
