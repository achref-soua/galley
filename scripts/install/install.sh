#!/usr/bin/env sh
# Galley — one-command installer for Linux and macOS (ADR-0034).
#
# Install / update:
#   curl -fsSL https://github.com/achref-soua/galley/releases/latest/download/install.sh | sh
#
# Uninstall:
#   curl -fsSL https://github.com/achref-soua/galley/releases/latest/download/install.sh | sh -s -- --uninstall
#
# Environment overrides:
#   GALLEY_VERSION       specific version (e.g. "0.9.2"); default: latest
#   GALLEY_INSTALL_DIR   where the `galley` launcher goes; default: ~/.local/bin
set -eu

REPO="achref-soua/galley"
INSTALL_DIR="${GALLEY_INSTALL_DIR:-${HOME}/.local/bin}"
LIB_DIR="${HOME}/.local/lib/galley"
INSTALL_SH_URL="https://github.com/${REPO}/releases/latest/download/install.sh"

# ── colour helpers (typewriter palette) ───────────────────────────────────────
# Colour on a real terminal, or when rendering the docs screenshot (demo mode).
if [ -t 1 ] || [ "${GALLEY_INSTALL_DEMO:-}" = "1" ]; then
  C_PAPER='\033[38;2;236;227;208m'  # #ECE3D0  warm type
  C_RIBBON='\033[38;2;168;54;43m'   # #A8362B  the red ribbon / platen
  C_SAGE='\033[38;2;120;150;120m'   # success
  C_YELLOW='\033[38;2;215;200;0m'   # warnings
  C_MUTED='\033[38;2;154;142;126m'  # #9A8E7E  secondary
  C_DARK='\033[38;2;90;90;90m'      # rules
  C_RESET='\033[0m'
else
  C_PAPER=''; C_RIBBON=''; C_SAGE=''; C_YELLOW=''; C_MUTED=''; C_DARK=''; C_RESET=''
fi

# The struck "GALLEY" wordmark on a red ribbon platen baseline — the brand mark.
logo() {
  printf '\n'
  printf "${C_PAPER}   ██████╗  █████╗ ██╗     ██╗     ███████╗██╗   ██╗${C_RESET}\n"
  printf "${C_PAPER}  ██╔════╝ ██╔══██╗██║     ██║     ██╔════╝╚██╗ ██╔╝${C_RESET}\n"
  printf "${C_PAPER}  ██║  ███╗███████║██║     ██║     █████╗   ╚████╔╝ ${C_RESET}\n"
  printf "${C_PAPER}  ██║   ██║██╔══██║██║     ██║     ██╔══╝    ╚██╔╝  ${C_RESET}\n"
  printf "${C_PAPER}  ╚██████╔╝██║  ██║███████╗███████╗███████╗   ██║   ${C_RESET}\n"
  printf "${C_PAPER}   ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   ${C_RESET}\n"
  printf "${C_RIBBON}  ══════════════════════════════════════════════════${C_RESET}\n"
  if [ -n "${1:-}" ]; then
    printf "${C_MUTED}  a local-first LaTeX studio · Pull a proof.   ${C_RIBBON}v%s${C_RESET}\n" "$1"
  else
    printf "${C_MUTED}  a local-first LaTeX studio · Pull a proof.${C_RESET}\n"
  fi
  printf '\n'
}

step() { printf "  ${C_RIBBON}%s${C_RESET} %s\n" "$1" "$2"; }
ok()   { printf "  ${C_SAGE}✔${C_RESET}  %s\n" "$1"; }
warn() { printf "  ${C_YELLOW}!${C_RESET}  %s\n" "$1" >&2; }
die()  { printf "\n  ${C_RIBBON}ERROR:${C_RESET} %s\n\n" "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required tool not found: $1"; }

# The closing "you're set" panel, shared by a real install and the docs demo.
summary() {
  printf '\n'
  printf "${C_DARK}  ┌────────────────────────────────────────────────┐${C_RESET}\n"
  printf "${C_SAGE}  │  ✔  Galley v%-35s│${C_RESET}\n" "$1 is set."
  printf "${C_MUTED}  │     run ${C_PAPER}galley${C_MUTED} to start · ${C_PAPER}galley update${C_MUTED} to upgrade   │${C_RESET}\n"
  printf "${C_MUTED}  │     ${C_PAPER}galley uninstall${C_MUTED} to remove                    │${C_RESET}\n"
  printf "${C_DARK}  └────────────────────────────────────────────────┘${C_RESET}\n"
  printf '\n'
}

# Print a faithful sample transcript for the README screenshot, then exit.
demo() {
  V="${GALLEY_VERSION:-0.9.2}"
  V="${V#v}"
  logo "$V"
  step '⟳' 'Checking the latest release...'
  step '↓' "Fetching v${V} for linux..."
  step '⊙' 'Verifying SHA-256 checksum...'
  ok 'Checksum verified.'
  ok "Installed the galley launcher → ${INSTALL_DIR}/galley"
  ok 'App launcher entry created (pin it from your menu).'
  summary "$V"
  exit 0
}

detect_os() {
  case "$(uname -s)" in
    Linux*) echo "linux" ;;
    Darwin*) echo "macos" ;;
    *) die "unsupported OS: $(uname -s)" ;;
  esac
}

# ── uninstall ─────────────────────────────────────────────────────────────────
uninstall() {
  installed=""
  [ -f "${LIB_DIR}/version" ] && installed="$(cat "${LIB_DIR}/version")"
  logo "$installed"
  step '⌫' "Removing Galley${installed:+ v$installed}..."
  rm -rf "$LIB_DIR"
  rm -f "${INSTALL_DIR}/galley"
  rm -f "${HOME}/.local/share/applications/galley.desktop"
  rm -f "${HOME}/.local/share/icons/hicolor/256x256/apps/galley.png"
  command -v update-desktop-database >/dev/null 2>&1 &&
    update-desktop-database "${HOME}/.local/share/applications" 2>/dev/null || true
  ok "Galley${installed:+ v$installed} has been removed. Your projects are untouched."
  printf '\n'
  exit 0
}

# ── checksum verification ─────────────────────────────────────────────────────
verify_sha256() {
  # $1 = file, $2 = expected sum
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$1" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$1" | awk '{print $1}')"
  else
    warn "no sha256sum/shasum found — skipping checksum verification"
    return 0
  fi
  [ "$actual" = "$2" ] || die "SHA-256 mismatch\n  expected: $2\n  got:      $actual"
}

download() {
  # $1 = url, $2 = output
  curl -fsSL -o "$2" "$1" 2>/dev/null || die "download failed: $1"
}

main() {
  [ "${GALLEY_INSTALL_DEMO:-}" = "1" ] && demo
  [ "${1:-}" = "--uninstall" ] && uninstall

  need curl
  need uname
  OS="$(detect_os)"

  step '⟳' 'Checking the latest release...'
  if [ -n "${GALLEY_VERSION:-}" ]; then
    VERSION="${GALLEY_VERSION#v}"
  else
    VERSION="$(curl -fsSL -H 'Accept: application/vnd.github+json' \
      "https://api.github.com/repos/${REPO}/releases/latest" |
      grep '"tag_name"' | head -1 |
      sed 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/')"
    [ -n "$VERSION" ] || die "could not determine the latest version from GitHub"
  fi

  logo "$VERSION"

  if [ "$OS" = "macos" ]; then
    warn "On macOS, install from the signed .dmg on the releases page:"
    printf "      ${C_MUTED}https://github.com/%s/releases/latest${C_RESET}\n\n" "$REPO"
    exit 0
  fi

  ASSET="Galley_${VERSION}_amd64.AppImage"
  BASE="https://github.com/${REPO}/releases/download/v${VERSION}"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  step '↓' "Fetching v${VERSION} for ${OS}..."
  download "${BASE}/${ASSET}" "${TMP}/${ASSET}"

  step '⊙' 'Verifying SHA-256 checksum...'
  if download "${BASE}/SHA256SUMS.txt" "${TMP}/SHA256SUMS.txt"; then
    expected="$(grep "$ASSET" "${TMP}/SHA256SUMS.txt" | awk '{print $1}')"
    [ -n "$expected" ] && verify_sha256 "${TMP}/${ASSET}" "$expected" && ok "Checksum verified."
  else
    warn "checksums unavailable — skipping verification"
  fi

  mkdir -p "$LIB_DIR" "$INSTALL_DIR"
  chmod 755 "${TMP}/${ASSET}"
  mv "${TMP}/${ASSET}" "${LIB_DIR}/Galley.AppImage"
  printf '%s' "$VERSION" >"${LIB_DIR}/version" # recorded so update/uninstall/version can show it

  # The `galley` launcher: run the app, or `galley update` / `galley uninstall`.
  cat >"${INSTALL_DIR}/galley" <<WRAPPER
#!/usr/bin/env sh
set -eu
case "\${1:-}" in
  update)         exec sh -c "curl -fsSL ${INSTALL_SH_URL} | sh" ;;
  uninstall)      exec sh -c "curl -fsSL ${INSTALL_SH_URL} | sh -s -- --uninstall" ;;
  version|--version|-v) cat "${LIB_DIR}/version" 2>/dev/null || echo unknown ;;
  --help|-h)      printf 'galley            launch Galley\ngalley version    print the installed version\ngalley update     update to the latest release\ngalley uninstall  remove Galley\n' ;;
  *)              exec "${LIB_DIR}/Galley.AppImage" "\$@" ;;
esac
WRAPPER
  chmod 755 "${INSTALL_DIR}/galley"
  ok "Installed the galley launcher → ${INSTALL_DIR}/galley"

  # Launcher icon + .desktop so Galley appears in the menu and pins with the G.
  ICON_DIR="${HOME}/.local/share/icons/hicolor/256x256/apps"
  APPS_DIR="${HOME}/.local/share/applications"
  mkdir -p "$ICON_DIR" "$APPS_DIR"
  if download "${BASE}/galley-256.png" "${ICON_DIR}/galley.png"; then
    cat >"${APPS_DIR}/galley.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Galley
Comment=A local-first LaTeX studio
Exec=${LIB_DIR}/Galley.AppImage %F
Icon=galley
Terminal=false
Categories=Office;Publishing;TextEditor;
MimeType=text/x-tex;
DESKTOP
    command -v update-desktop-database >/dev/null 2>&1 &&
      update-desktop-database "$APPS_DIR" 2>/dev/null || true
    ok "App launcher entry created (pin it from your menu)."
  else
    warn "Could not fetch the icon — skipping the launcher entry."
  fi

  summary "$VERSION"

  case ":$PATH:" in
    *":${INSTALL_DIR}:"*) ;;
    *) warn "${INSTALL_DIR} is not on your PATH — add it to use the 'galley' command." ;;
  esac
}

main "$@"
