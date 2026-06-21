# Installing Galley

Galley installs with one command and keeps itself current.

## One-command install

```sh
# Linux / macOS
curl -fsSL https://github.com/achref-soua/galley/releases/latest/download/install.sh | sh
```

```powershell
# Windows
irm https://github.com/achref-soua/galley/releases/latest/download/install.ps1 | iex
```

The installer downloads the right native build for your OS, verifies its SHA-256
against the release's `SHA256SUMS.txt`, installs a small `galley` launcher, and
registers the menu icon so Galley appears in your launcher and pins with the
double-strike **G**.

![Installer output](assets/install.png)

## The `galley` command (Linux/macOS)

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `galley`           | Launch Galley                                  |
| `galley version`   | Print the installed version                    |
| `galley update`    | Re-run the installer to get the latest release |
| `galley uninstall` | Remove Galley (your projects are untouched)    |

The installed version is recorded so it shows on install, update, and uninstall,
and `galley version` prints it.

On **Windows**, update by re-running the one-liner; uninstall with the script's
`-Uninstall` switch or from **Settings → Apps**. The installed version shows in
the installer output and in **Add/Remove Programs**.

## In-app updates

On launch (unless disabled in **Settings → About → Check for updates on launch**),
Galley asks the core process — never the webview, whose CSP forbids cross-origin
calls — whether a newer release exists, and if so shows a dismissible banner with
an **Update** button that opens the download. The check is a single request to the
GitHub releases API and sends nothing about you.

## Environment overrides

- `GALLEY_VERSION` — install a specific version (e.g. `0.9.2`) instead of latest.
- `GALLEY_INSTALL_DIR` — where the `galley` launcher is placed (default
  `~/.local/bin`).

## Build from source

See the README's build reference and [`docs/packaging.md`](packaging.md): `just
package` builds the native installer for your OS.

## Regenerating the installer screenshot

`just install-shot` renders `docs/assets/install.png` from the **real** installer
output (a colour-forced demo mode), so the screenshot never drifts from the
script.
