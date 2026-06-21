# Download Galley

Galley is a native desktop app for **Windows, macOS, and Linux**. Installers are
published on the [GitHub Releases page](https://github.com/achref-soua/galley/releases/latest),
each with a `SHA256SUMS.txt` for verification.

| OS      | Installer                   | Notes                                  |
| ------- | --------------------------- | -------------------------------------- |
| Windows | `.msi` / `.exe` (NSIS)      | Start-menu entry; pin to the taskbar.  |
| macOS   | `.dmg` (`.app` inside)      | Drag to Applications; pin to the Dock. |
| Linux   | `.AppImage`, `.deb`, `.rpm` | `.desktop` entry; pin to the panel.    |

After installing, Galley appears in your launcher with the double-strike **G**
icon and pins to the taskbar / Dock / panel.

## Verify your download

```sh
sha256sum -c SHA256SUMS.txt   # Linux
shasum -a 256 -c SHA256SUMS.txt  # macOS
```

On Windows, compare the output of `Get-FileHash <file>` against `SHA256SUMS.txt`.

## Build from source

Galley is fully self-buildable. With the toolchain installed (Rust, Node ≥ 20.9,
pnpm, and the Tauri system dependencies for your OS):

```sh
git clone https://github.com/achref-soua/galley
cd galley
pnpm install
just package   # builds the native installer for the current OS
```

The installer lands in `apps/desktop/src-tauri/target/release/bundle/`. See the
README's build reference for per-OS prerequisites.
