# Guildhall: installs the prompt hooks that tell the Files and Changes panels which folder each
# terminal is in (extras/guildhall-cwd.ps1 for PowerShell, extras/guildhall-cwd.sh for WSL bash).
# Backs up what it edits (<file>.bak-<time>) and does nothing twice.
#   pwsh -File extras/install-cwd-hooks.ps1 [-Distro archlinux] [-NoWsl]
param([string]$Distro, [switch]$NoWsl)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

# PowerShell: the hook beside the stamina files, dot-sourced at the end of the profile.
$dir = Join-Path $HOME ".guildhall"
New-Item -ItemType Directory -Force -Path (Join-Path $dir "cwd") | Out-Null
Copy-Item (Join-Path $here "guildhall-cwd.ps1") (Join-Path $dir "guildhall-cwd.ps1") -Force
if (-not (Test-Path $PROFILE)) { New-Item -ItemType File -Force -Path $PROFILE | Out-Null }
if (Select-String -Path $PROFILE -SimpleMatch "guildhall-cwd.ps1" -Quiet) {
  Write-Host "PowerShell: already in $PROFILE"
} else {
  Copy-Item $PROFILE "$PROFILE.bak-$stamp"
  Add-Content $PROFILE "`n# Guildhall: tell Herdr's Files and Changes panels which folder this terminal is in (keep last).`n. `"`$HOME\.guildhall\guildhall-cwd.ps1`""
  Write-Host "PowerShell: added to $PROFILE (backup: $PROFILE.bak-$stamp)"
}

# WSL: the hook in ~/.config/guildhall/cwd.sh, sourced from ~/.bashrc.
if (-not $NoWsl -and (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
  $d = if ($Distro) { @("-d", $Distro) } else { @() }
  $src = (& wsl.exe @d --exec wslpath -a ($here -replace '\\', '/')).Trim() + "/guildhall-cwd.sh"
  $script = @"
set -e
mkdir -p ~/.config/guildhall
cp "$src" ~/.config/guildhall/cwd.sh
if grep -q 'guildhall/cwd.sh' ~/.bashrc 2>/dev/null; then echo "WSL: already in ~/.bashrc"; exit 0; fi
[ -f ~/.bashrc ] && cp ~/.bashrc ~/.bashrc.bak-$stamp
printf '\n# Guildhall: tell Herdr'"'"'s Files and Changes panels which folder this shell is in.\n[ -f ~/.config/guildhall/cwd.sh ] && . ~/.config/guildhall/cwd.sh\n' >> ~/.bashrc
echo "WSL: added to ~/.bashrc (backup: ~/.bashrc.bak-$stamp)"
"@
  & wsl.exe @d --exec bash -c ($script -replace "`r", "")
}
Write-Host "Done. New terminals report their folder; open ones need a new shell (or: . `$PROFILE / source ~/.bashrc)."
