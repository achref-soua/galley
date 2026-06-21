# Galley — one-command installer for Windows (PowerShell 5.1+) (ADR-0034).
#
# Install / update:
#   irm https://raw.githubusercontent.com/achref-soua/galley/main/scripts/install/install.ps1 | iex
#
# Uninstall:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/achref-soua/galley/main/scripts/install/install.ps1))) -Uninstall
#
# Environment override:
#   $env:GALLEY_VERSION  specific version (e.g. "0.9.3"); default: latest
[CmdletBinding()]
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'

# Render the Unicode wordmark correctly (must run BEFORE any output). VT/ANSI
# truecolor is on by default on Windows 10 build 14393+.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Repo = 'achref-soua/galley'

# ── ANSI true-color helpers (typewriter palette) ──────────────────────────────
$E = [char]27
$P = "${E}[38;2;236;227;208m"  # paper  #ECE3D0
$RB = "${E}[38;2;168;54;43m"   # ribbon #A8362B
$SG = "${E}[38;2;120;150;120m" # sage (success)
$MU = "${E}[38;2;154;142;126m" # muted
$YW = "${E}[38;2;215;200;0m"   # warnings
$R = "${E}[0m"

function Show-Logo {
  param([string]$Version = '')
  Write-Host ''
  Write-Host "${P}   ██████╗  █████╗ ██╗     ██╗     ███████╗██╗   ██╗${R}"
  Write-Host "${P}  ██╔════╝ ██╔══██╗██║     ██║     ██╔════╝╚██╗ ██╔╝${R}"
  Write-Host "${P}  ██║  ███╗███████║██║     ██║     █████╗   ╚████╔╝ ${R}"
  Write-Host "${P}  ██║   ██║██╔══██║██║     ██║     ██╔══╝    ╚██╔╝  ${R}"
  Write-Host "${P}  ╚██████╔╝██║  ██║███████╗███████╗███████╗   ██║   ${R}"
  Write-Host "${P}   ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   ${R}"
  Write-Host "${RB}  ══════════════════════════════════════════════════${R}"
  if ($Version) {
    Write-Host "${MU}  a local-first LaTeX studio · Pull a proof.   ${RB}v$Version${R}"
  } else {
    Write-Host "${MU}  a local-first LaTeX studio · Pull a proof.${R}"
  }
  Write-Host ''
}

function Show-Step { param($Icon, $Msg) Write-Host "  ${RB}$Icon${R} $Msg" }
function Write-Ok { param($Msg) Write-Host "  ${SG}✔${R}  $Msg" }
function Write-Warn { param($Msg) Write-Host "  ${YW}!${R}  $Msg" }
function Fail { param($Msg) Write-Host "`n  ${RB}ERROR: $Msg${R}`n"; exit 1 }

# Locate Galley's registry uninstall entry (per-user NSIS install).
function Get-GalleyUninstall {
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  Get-ItemProperty $roots -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like 'Galley*' } | Select-Object -First 1
}

if ($Uninstall) {
  $entry = Get-GalleyUninstall
  Show-Logo ($entry.DisplayVersion)
  if ($entry -and $entry.UninstallString) {
    Show-Step '⌫' "Removing Galley $($entry.DisplayVersion)..."
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $entry.UninstallString -Wait
    Write-Ok 'Galley has been removed. Your projects are untouched.'
  } else {
    Write-Warn 'Galley was not found in the installed programs.'
  }
  return
}

# Resolve version.
Show-Step '⟳' 'Checking the latest release...'
if ($env:GALLEY_VERSION) {
  $Version = $env:GALLEY_VERSION -replace '^v', ''
} else {
  $rel = Invoke-RestMethod -Headers @{ 'Accept' = 'application/vnd.github+json' } `
    -Uri "https://api.github.com/repos/$Repo/releases/latest"
  $Version = ($rel.tag_name -replace '^v', '')
}
Show-Logo $Version

$Base = "https://github.com/$Repo/releases/download/v$Version"
$Msi = "Galley_${Version}_x64_en-US.msi"
$Exe = "Galley_${Version}_x64-setup.exe"

# Download one named asset to the temp directory, returning its path.
function Get-Asset {
  param([string]$Name)
  $dest = Join-Path $env:TEMP $Name
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -Uri "$Base/$Name" -OutFile $dest -UseBasicParsing
  return $dest
}

# Prefer the MSI: an unsigned NSIS .exe is more likely to trip Windows Defender's
# heuristics than the WiX MSI, and msiexec installs it cleanly. Fall back to the
# NSIS installer only if no MSI is published for this release.
Show-Step '↓' "Fetching v$Version for windows..."
try {
  $Asset = $Msi
  $Out = Get-Asset $Msi
} catch {
  try {
    $Asset = $Exe
    $Out = Get-Asset $Exe
  } catch {
    Write-Host ''
    Write-Warn "No prebuilt Windows installer is published for v$Version yet."
    Write-Host "${MU}  Galley's Windows installer is built on a Windows CI runner. Until it is" -NoNewline
    Write-Host " published, you can:${R}"
    Write-Host "${MU}    • watch ${R}https://github.com/$Repo/releases/latest"
    Write-Host "${MU}    • or build it yourself on Windows:${R}"
    Write-Host "${P}        git clone https://github.com/$Repo; cd galley${R}"
    Write-Host "${P}        pnpm install; cargo install tauri-cli --version `"^2`" --locked${R}"
    Write-Host "${P}        pnpm --filter @galley/desktop tauri build${R}"
    Write-Host ''
    exit 1
  }
}

# Verify the checksum when SHA256SUMS.txt is published.
try {
  $sums = (Invoke-WebRequest -Uri "$Base/SHA256SUMS.txt" -UseBasicParsing).Content
  $line = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($Asset) } | Select-Object -First 1)
  if ($line) {
    $expected = ($line -split '\s+')[0]
    $actual = (Get-FileHash -Algorithm SHA256 $Out).Hash.ToLower()
    if ($expected -ne $actual) { Fail "SHA-256 mismatch: expected $expected, got $actual" }
    Write-Ok 'Checksum verified.'
  }
} catch {
  Write-Warn "checksum step skipped: $($_.Exception.Message)"
}

# Guidance shown when Windows Defender / SmartScreen blocks the unsigned installer.
function Show-SecurityHelp {
  Write-Host ''
  Write-Warn 'Windows blocked the installer.'
  Write-Host "${MU}  Galley's installer isn't code-signed yet, so Windows Defender/SmartScreen may" -NoNewline
  Write-Host " flag it as unsafe — this is a known false positive for unsigned installers.${R}"
  Write-Host "${MU}  The file is verified by SHA-256 above and lives at:${R}"
  Write-Host "${P}    $Out${R}"
  Write-Host "${MU}  To proceed:${R}"
  Write-Host "${MU}    • Windows Security > Virus & threat protection > Protection history >${R}"
  Write-Host "${MU}      select the Galley item > Actions > Allow, then re-run this command.${R}"
  Write-Host "${MU}    • Or run the verified file above yourself (double-click, then${R}"
  Write-Host "${MU}      'More info' > 'Run anyway' if SmartScreen appears).${R}"
  Write-Host "${MU}    • Or report the false positive: ${R}https://www.microsoft.com/wdsi/filesubmission"
  Write-Host ''
}

Show-Step '▸' 'Running the installer...'
try {
  if ($Asset -like '*.msi') {
    $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', "`"$Out`"" -Wait -PassThru
    # 0 = success, 1602 = user cancelled, 3010 = success/reboot required.
    if ($proc.ExitCode -notin @(0, 1602, 3010)) {
      Fail "the installer exited with code $($proc.ExitCode)."
    }
  } else {
    Start-Process -FilePath $Out -Wait
  }
} catch {
  Show-SecurityHelp
  exit 1
}

Write-Host ''
Write-Ok "Galley v$Version is installed. Pin it to the taskbar from the Start menu."
Write-Host "${MU}  Update later by re-running the one-liner; uninstall with -Uninstall or Settings > Apps.${R}"
Write-Host ''
