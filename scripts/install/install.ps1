# Galley — one-command installer for Windows (ADR-0034).
#
# Install / update:
#   irm https://github.com/achref-soua/galley/releases/latest/download/install.ps1 | iex
#
# Uninstall:
#   & ([scriptblock]::Create((irm https://github.com/achref-soua/galley/releases/latest/download/install.ps1))) -Uninstall
#
# Environment override:
#   $env:GALLEY_VERSION  specific version (e.g. "0.9.2"); default: latest
[CmdletBinding()]
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$Repo = 'achref-soua/galley'
$e = [char]27
$Paper = "$e[38;2;236;227;208m"; $Ribbon = "$e[38;2;168;54;43m"
$Sage = "$e[38;2;120;150;120m"; $Muted = "$e[38;2;154;142;126m"; $R = "$e[0m"

function Show-Logo([string]$Version) {
  Write-Host ""
  Write-Host "$Paper   ██████╗  █████╗ ██╗     ██╗     ███████╗██╗   ██╗$R"
  Write-Host "$Paper  ██╔════╝ ██╔══██╗██║     ██║     ██╔════╝╚██╗ ██╔╝$R"
  Write-Host "$Paper  ██║  ███╗███████║██║     ██║     █████╗   ╚████╔╝ $R"
  Write-Host "$Paper  ██║   ██║██╔══██║██║     ██║     ██╔══╝    ╚██╔╝  $R"
  Write-Host "$Paper  ╚██████╔╝██║  ██║███████╗███████╗███████╗   ██║   $R"
  Write-Host "$Paper   ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   $R"
  Write-Host "$Ribbon  ══════════════════════════════════════════════════$R"
  if ($Version) {
    Write-Host "$Muted  a local-first LaTeX studio · Pull a proof.   ${Ribbon}v$Version$R"
  } else {
    Write-Host "$Muted  a local-first LaTeX studio · Pull a proof.$R"
  }
  Write-Host ""
}

function Step($s, $m) { Write-Host "  $Ribbon$s$R $m" }
function Ok($m) { Write-Host "  $Sage" -NoNewline; Write-Host "OK$R $m" }

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
    Step '⌫' "Removing Galley $($entry.DisplayVersion)..."
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $entry.UninstallString -Wait
    Ok 'Galley has been removed. Your projects are untouched.'
  } else {
    Write-Host "  $Muted Galley was not found in the installed programs.$R"
  }
  return
}

# Resolve version.
Step '⟳' 'Checking the latest release...'
if ($env:GALLEY_VERSION) {
  $Version = $env:GALLEY_VERSION -replace '^v', ''
} else {
  $rel = Invoke-RestMethod -Headers @{ 'Accept' = 'application/vnd.github+json' } `
    -Uri "https://api.github.com/repos/$Repo/releases/latest"
  $Version = ($rel.tag_name -replace '^v', '')
}
Show-Logo $Version

$Asset = "Galley_${Version}_x64-setup.exe"
$Url = "https://github.com/$Repo/releases/download/v$Version/$Asset"
$Out = Join-Path $env:TEMP $Asset

Step '⬇' "Fetching v$Version for windows..."
Invoke-WebRequest -Uri $Url -OutFile $Out

# Verify the checksum when SHA256SUMS.txt is published.
try {
  $sums = (Invoke-WebRequest -Uri "https://github.com/$Repo/releases/download/v$Version/SHA256SUMS.txt").Content
  $line = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($Asset) } | Select-Object -First 1)
  if ($line) {
    $expected = ($line -split '\s+')[0]
    $actual = (Get-FileHash -Algorithm SHA256 $Out).Hash.ToLower()
    if ($expected -ne $actual) { throw "SHA-256 mismatch: expected $expected, got $actual" }
    Ok 'Checksum verified.'
  }
} catch {
  Write-Host "  $Muted (checksum step skipped: $($_.Exception.Message))$R"
}

Step '▸' 'Running the installer...'
Start-Process -FilePath $Out -Wait

Write-Host ""
Ok "Galley v$Version is installed. Pin it to the taskbar from the Start menu."
Write-Host "$Muted  Update later by re-running this one-liner; uninstall with -Uninstall or via Settings > Apps.$R"
Write-Host ""
