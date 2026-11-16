# Guildhall updater (Windows). Linux and macOS use update.sh next to this file.
# Downloads the latest Guildhall from GitHub and copies its layout, themes and mods into
# Herdr's folder. Herdr reloads them by itself. The same script runs from the palette
# ("Update Guildhall...") and from a terminal:
#
#   powershell -ExecutionPolicy Bypass -File update.ps1           # show changes, ask, apply
#   powershell -ExecutionPolicy Bypass -File update.ps1 -Check    # only compare versions
#   powershell -ExecutionPolicy Bypass -File update.ps1 -DryRun   # only list what would change
#   powershell -ExecutionPolicy Bypass -File update.ps1 -Yes      # apply without asking
#
# Options: -HerdrHome DIR (Herdr's folder; default $env:HERDR_APP_HOME, else the folder two
#          levels above this script), -Source DIR (copy from a local clone instead of
#          downloading), -Repo OWNER/NAME (default Nerqs/guildhall), -Ref BRANCH|SHA,
#          -Detach (with -Yes: run hidden in the background, writing to
#          <home>\data\guildhall-update\last.log; the palette's dialog uses it and reads that log),
#          -Log FILE (append the output there).
#
# Before changing anything it saves a backup in <home>\data\guildhall-update\backups (the last 10).
# keys.json only gains the repo's new keys; a key you already use is never replaced.
# Works in Windows PowerShell 5.1 and PowerShell 7. Keep this file ASCII.
[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$DryRun,
  [switch]$Yes,
  [switch]$Detach,
  [string]$HerdrHome = "",
  [string]$Source = "",
  [string]$Repo = "Nerqs/guildhall",
  [string]$Ref = "",
  [string]$Log = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is very slow with the progress bar
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

# Every line goes to stdout, or to the log when there is one.
function Out([string]$m) {
  if ($Log) { Add-Content -LiteralPath $Log -Value $m -Encoding UTF8 } else { [Console]::Out.WriteLine($m) }
}
function Say([string]$m) { Out "==> $m" }
function Short([string]$s) { if ($s) { $s.Substring(0, [Math]::Min(7, $s.Length)) } else { "" } }
function Rel([string]$root, [string]$full) { $full.Substring($root.Length).TrimStart('\', '/').Replace('\', '/') }
function Skip([string]$rel) { $rel -match '(^|/)\.preview/' -or $rel -match '\.tmp$' -or $rel -match '(^|/)(Thumbs\.db|desktop\.ini)$' }
function SameFile([string]$a, [string]$b) {
  if ((Get-Item -LiteralPath $a -Force).Length -ne (Get-Item -LiteralPath $b -Force).Length) { return $false }
  return (Get-FileHash -LiteralPath $a -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $b -Algorithm SHA256).Hash
}
function Quote([string]$s) { '"' + $s.Replace('"', '\"') + '"' }

function Main {
  if (-not $script:HerdrHome) {
    if ($env:HERDR_APP_HOME) { $script:HerdrHome = $env:HERDR_APP_HOME }
    else { $script:HerdrHome = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent }   # <home>\mods\guildhall-update
  }
  $H = (Resolve-Path -LiteralPath $script:HerdrHome).Path
  $State = Join-Path $H "data/guildhall-update"
  $Stamp = Join-Path $State "installed"
  $Headers = @{ "User-Agent" = "guildhall-update" }

  # In the background: start a hidden copy of this script that writes to last.log, and return at once.
  if ($Detach) {
    New-Item -ItemType Directory -Force -Path $State | Out-Null
    $logFile = Join-Path $State "last.log"
    Set-Content -LiteralPath $logFile -Value ("STARTED " + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -Encoding UTF8
    $exe = (Get-Process -Id $PID).Path
    $al = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Quote $PSCommandPath), "-Yes",
            "-HerdrHome", (Quote $H), "-Repo", (Quote $Repo), "-Log", (Quote $logFile))
    if ($Source) { $al += @("-Source", (Quote $Source)) }
    if ($Ref) { $al += @("-Ref", (Quote $Ref)) }
    if ($IsWindows -eq $false) { Start-Process -FilePath $exe -ArgumentList ($al -join " ") | Out-Null }   # pwsh on Linux/macOS
    else { Start-Process -FilePath $exe -ArgumentList ($al -join " ") -WindowStyle Hidden | Out-Null }
    [Console]::Out.WriteLine("started $logFile")
    return 0
  }

  $installed = "none"
  if (Test-Path -LiteralPath $Stamp) { $installed = (Get-Content -LiteralPath $Stamp -TotalCount 1) }

  # ---- 1. The latest version --------------------------------------------------------
  $latest = ""; $subject = ""; $date = ""
  if (-not $Source) {
    try {
      $r = if ($Ref) { $Ref } else { "HEAD" }
      $api = Invoke-RestMethod -UseBasicParsing -Headers $Headers -Uri "https://api.github.com/repos/$Repo/commits/$r"
      $latest = [string]$api.sha
      $subject = ([string]$api.commit.message -split "`n")[0].Trim()
      $d = $api.commit.committer.date   # PowerShell 7 turns it into a DateTime
      $date = if ($d -is [datetime]) { $d.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") } else { [string]$d }
    } catch {}
  } else {
    if (Get-Command git -ErrorAction SilentlyContinue) {
      $latest = [string](& git -C $Source rev-parse HEAD 2>$null)
      $subject = [string](& git -C $Source log -1 --format=%s 2>$null)
    }
    if (-not $latest) { $latest = "local" }
    if (-not $subject) { $subject = "local folder $Source" }
  }

  if ($Check) {
    Out "installed=$installed"
    Out ("latest=" + $(if ($latest) { $latest } else { "unknown" }))
    Out "subject=$subject"
    Out "date=$date"
    if (-not $latest) { Out "status=offline" }
    elseif ($latest -eq $installed) { Out "status=up-to-date" }
    else { Out "status=update-available" }
    return 0
  }

  $Tmp = Join-Path ([IO.Path]::GetTempPath()) ("guildhall-update-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  try {
    # ---- 2. Get the files -----------------------------------------------------------
    if ($Source) {
      $Src = (Resolve-Path -LiteralPath $Source).Path
      Say "Using local folder $Src"
    } else {
      $what = if ($latest) { $latest } elseif ($Ref) { $Ref } else { "HEAD" }
      Say "Downloading $Repo $(Short $what)"
      $zip = Join-Path $Tmp "repo.zip"
      Invoke-WebRequest -UseBasicParsing -Headers $Headers -Uri "https://codeload.github.com/$Repo/zip/$what" -OutFile $zip
      Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $Tmp "repo")
      $Src = (Get-ChildItem -LiteralPath (Join-Path $Tmp "repo") -Directory | Select-Object -First 1).FullName
    }
    if ($subject) { Say "Version: $(Short $latest) $subject" }
    foreach ($d in "layouts", "themes", "mods") {
      if (-not (Test-Path -LiteralPath (Join-Path $Src $d))) { throw "'$d' missing in $Src" }
    }

    # ---- 3. What changes ------------------------------------------------------------
    $files = New-Object System.Collections.Generic.List[string]
    Get-ChildItem -LiteralPath (Join-Path $Src "layouts") -File -Filter "guildhall*" | ForEach-Object { $files.Add((Rel $Src $_.FullName)) }
    Get-ChildItem -LiteralPath (Join-Path $Src "themes") -File -Filter "guildhall*.json" | ForEach-Object { $files.Add((Rel $Src $_.FullName)) }
    $mods = @(Get-ChildItem -LiteralPath (Join-Path $Src "mods") -Directory -Filter "guildhall-*")
    foreach ($m in $mods) {
      Get-ChildItem -LiteralPath $m.FullName -File -Recurse -Force | ForEach-Object {
        $rel = Rel $Src $_.FullName
        if (-not (Skip $rel)) { $files.Add($rel) }
      }
    }
    $set = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($f in $files) { [void]$set.Add($f) }

    $plan = New-Object System.Collections.Generic.List[object]
    foreach ($f in $files) {
      $dst = Join-Path $H $f
      if (-not (Test-Path -LiteralPath $dst)) { $plan.Add(@("+", $f)) }
      elseif (-not (SameFile (Join-Path $Src $f) $dst)) { $plan.Add(@("~", $f)) }
    }
    # Files gone from a mod in the repo (Herdr's own generated files stay).
    foreach ($m in $mods) {
      $here = Join-Path $H ("mods/" + $m.Name)
      if (-not (Test-Path -LiteralPath $here)) { continue }
      Get-ChildItem -LiteralPath $here -File -Recurse -Force | ForEach-Object {
        $rel = Rel $H $_.FullName
        if ($_.Name -in @("gpui-kit.d.ts", "jsconfig.json") -or (Skip $rel)) { return }
        if (-not $set.Contains($rel)) { $plan.Add(@("-", $rel)) }
      }
    }

    # keys.json: add the repo's keys you don't have; a key you already use is kept.
    $keysFile = Join-Path $H "keys.json"
    $keyLines = New-Object System.Collections.Generic.List[string]
    $keysOut = $null
    $repoKeys = Join-Path $Src "keys.json"
    if (Test-Path -LiteralPath $repoKeys) {
      $new = Get-Content -LiteralPath $repoKeys -Raw -Encoding UTF8 | ConvertFrom-Json
      $cur = if (Test-Path -LiteralPath $keysFile) { Get-Content -LiteralPath $keysFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { New-Object psobject }
      $added = 0
      foreach ($sec in $new.PSObject.Properties) {
        $have = $cur.PSObject.Properties[$sec.Name]
        if (-not $have) { $cur | Add-Member -NotePropertyName $sec.Name -NotePropertyValue (New-Object psobject); $have = $cur.PSObject.Properties[$sec.Name] }
        foreach ($k in $sec.Value.PSObject.Properties) {
          $old = $have.Value.PSObject.Properties[$k.Name]
          if (-not $old) {
            $have.Value | Add-Member -NotePropertyName $k.Name -NotePropertyValue $k.Value
            $keyLines.Add("+ $($sec.Name): $($k.Name) -> $($k.Value)"); $added++
          } elseif ($old.Value -ne $k.Value) {
            $keyLines.Add("! $($sec.Name): $($k.Name) stays '$($old.Value)' (repo has '$($k.Value)')")
          }
        }
      }
      if ($added) { $keysOut = $cur }
    }

    if ($plan.Count -eq 0 -and -not $keysOut) {
      foreach ($l in $keyLines) { Out $l }
      if ($latest) { New-Item -ItemType Directory -Force -Path $State | Out-Null; Set-Content -LiteralPath $Stamp -Value @($latest, $subject) -Encoding UTF8 }
      Say "Already up to date."
      return 0
    }
    Say "Changes in ${H}:"
    foreach ($p in $plan) { Out "$($p[0]) $($p[1])" }
    if ($keyLines.Count) { Out "keys.json:"; foreach ($l in $keyLines) { Out $l } }

    if ($DryRun) { Say "Dry run: nothing changed."; return 0 }
    if (-not $Yes) {
      $a = Read-Host "Apply? [y/N]"
      if ($a -notmatch '^[yYsS]') { Out "Cancelled."; return 0 }
    }

    # ---- 4. Backup ------------------------------------------------------------------
    $bdir = Join-Path $State "backups"
    New-Item -ItemType Directory -Force -Path $bdir | Out-Null
    $bk = Join-Path $bdir ((Get-Date -Format "yyyyMMdd-HHmmss") + ".zip")
    $items = @()
    foreach ($pat in "keys.json", "layouts/guildhall*", "themes/guildhall*", "mods/guildhall-*") {
      $items += @(Get-Item -Path (Join-Path $H $pat) -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    }
    if ($items.Count) {
      # Keep the folder structure inside the zip: stage a copy, then zip it.
      $stage = Join-Path $Tmp "backup"
      foreach ($it in $items) {
        $to = Join-Path $stage (Rel $H $it)
        New-Item -ItemType Directory -Force -Path (Split-Path $to -Parent) | Out-Null
        Copy-Item -LiteralPath $it -Destination $to -Recurse -Force
      }
      Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $bk -Force
      Get-ChildItem -LiteralPath $bdir -Filter "*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10 | Remove-Item -Force
      Say "Backup: $bk"
    }

    # ---- 5. Apply -------------------------------------------------------------------
    foreach ($p in $plan) {
      $dst = Join-Path $H $p[1]
      if ($p[0] -eq "-") { Remove-Item -LiteralPath $dst -Force; continue }
      New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
      Copy-Item -LiteralPath (Join-Path $Src $p[1]) -Destination $dst -Force
    }
    if ($keysOut) {
      $json = $keysOut | ConvertTo-Json -Depth 10
      [IO.File]::WriteAllText($keysFile, $json + "`n", (New-Object Text.UTF8Encoding $false))
    }
    New-Item -ItemType Directory -Force -Path $State | Out-Null
    Set-Content -LiteralPath $Stamp -Value @($(if ($latest) { $latest } else { "unknown" }), $subject) -Encoding UTF8

    # ---- 6. Check the mods ----------------------------------------------------------
    $fail = $false
    if (Get-Command herdr-app -ErrorAction SilentlyContinue) {
      Say "Checking mods"
      foreach ($m in $mods) {
        $out = & herdr-app check (Join-Path $H ("mods/" + $m.Name)) 2>&1
        if ($LASTEXITCODE -eq 0) { Out "  ok    $($m.Name)" }
        else { Out "  FAIL  $($m.Name)"; foreach ($l in $out) { Out "        $l" }; $fail = $true }
      }
    }
    if ($fail) { Say "Some mod failed its check. To go back, unzip $bk into $H"; return 1 }
    Say "Done. Herdr reloads the layout, themes and mods by itself."
    return 0
  } finally {
    Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$rc = 1
try { $rc = @(Main)[-1] } catch { Out "error: $($_.Exception.Message)"; $rc = 1 }
if ($Log) { Out "RESULT $rc" }
exit $rc
