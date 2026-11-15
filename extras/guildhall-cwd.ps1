# Guildhall: tells the Files and Changes panels which folder this PowerShell is in.
# Herdr only knows where a terminal started: `cd` in PowerShell doesn't move the process.
# Each prompt (when the folder changed) writes ~/.guildhall/cwd/<HC_TERMINAL_ID>:
#   line 1: the WSL distro (empty here), line 2: the folder.
# Install: dot-source it at the END of your profile (after prompt tools such as starship or
# oh-my-posh), e.g.  . "$HOME\.guildhall\guildhall-cwd.ps1"
if ($env:HC_TERMINAL_ID -and -not $global:GuildhallCwdFile) {
  $global:GuildhallCwdFile = Join-Path $HOME ".guildhall\cwd\$($env:HC_TERMINAL_ID)"
  $null = New-Item -ItemType Directory -Force -Path (Split-Path $global:GuildhallCwdFile)
  $global:GuildhallCwdLast = $null
  $global:GuildhallCwdPrompt = $function:prompt
  function global:prompt {
    $here = $ExecutionContext.SessionState.Path.CurrentFileSystemLocation.ProviderPath
    if ($here -and $here -ne $global:GuildhallCwdLast) {
      $global:GuildhallCwdLast = $here
      try { [IO.File]::WriteAllText($global:GuildhallCwdFile, "`n$here`n") } catch {}
    }
    & $global:GuildhallCwdPrompt
  }
}
