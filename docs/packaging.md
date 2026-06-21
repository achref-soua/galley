# Packaging & installers

Galley ships as a native desktop app on Windows, macOS, and Linux. Installers are
built locally per OS (GitHub Actions is dormant for now).

## Build an installer

```sh
pnpm install
just package    # builds every native installer for the current OS
just checksums  # writes SHA256SUMS.txt next to the bundles
```

Artifacts land in `apps/desktop/src-tauri/target/release/bundle/`:

| OS      | Targets                     |
| ------- | --------------------------- |
| Linux   | `.AppImage`, `.deb`, `.rpm` |
| Windows | `.msi`, NSIS `.exe`         |
| macOS   | `.app` (inside `.dmg`)      |

`bundle.targets` is `"all"`, so each OS produces its full native set. `.rpm`
needs `rpmbuild` on the build host; `.dmg`/notarization need macOS + Xcode;
signed `.msi`/`.exe` need a Windows signing certificate.

## Desktop integration

- **Icons** — one 1024² master (`assets/brand/icon-master.svg`) drives the whole
  set via `just icons` (Windows `.ico`, macOS `.icns`, Linux hicolor PNGs),
  legible to 16 px.
- **Pinning** — the app appears in the launcher and pins to the taskbar / Dock /
  panel showing the **G**. The stable `identifier` (`dev.galley.studio`) gives
  Windows a correct AppUserModelID for taskbar grouping.
- **File associations** — the installer offers to register `.tex` and `.galley`
  (opt-in, reversible). `file-assoc.ts` routes an opened path to the editor.

## Signing & notarization

Wired but disabled until certificates exist (`just sign` is a no-op placeholder).
When ready:

- **Windows** — Authenticode sign the `.msi`/`.exe`.
- **macOS** — Developer ID sign, notarize, and staple the `.app`/`.dmg`.
- **Linux** — GPG-sign the artifacts.

Every release publishes `SHA256SUMS.txt` so downloads are verifiable even when
unsigned.

## Optional auto-update

The Tauri updater is **off by default** and user-controlled. The UI side is
`update-check.ts` (`isUpdateAvailable(current, latest)`), which decides whether to
surface a skippable prompt. Enabling actual downloads is a config-and-key flip
(generate an updater signing key, set `plugins.updater.pubkey` + endpoints, and
`bundle.createUpdaterArtifacts`), documented here rather than enabled by default —
the same posture as code signing.
