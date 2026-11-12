# Guildhall status line: prints a short status line for Claude Code and, inside
# Herdr (HC_TERMINAL_ID set), saves this session's stamina for the Guildhall layout:
#   ~/.guildhall/stamina/<terminal>.json  { context_left, session_used, resets_at, at }
$raw = [Console]::In.ReadToEnd()
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }

$ctxLeft = $j.context_window.remaining_percentage
$fiveUsed = $j.rate_limits.five_hour.used_percentage
$resets = $j.rate_limits.five_hour.resets_at
$weekUsed = $j.rate_limits.seven_day.used_percentage
$weekResets = $j.rate_limits.seven_day.resets_at

$id = $env:HC_TERMINAL_ID
if ($id) {
  $dir = Join-Path $env:USERPROFILE ".guildhall\stamina"
  New-Item -ItemType Directory -Force $dir | Out-Null
  $out = [ordered]@{
    context_left = $ctxLeft
    session_used = $fiveUsed
    resets_at    = $resets
    week_used    = $weekUsed
    week_resets  = $weekResets
    at           = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
  $tmp = Join-Path $dir "$id.json.tmp"
  [System.IO.File]::WriteAllText($tmp, ($out | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding $false))
  Move-Item -Force $tmp (Join-Path $dir "$id.json")
}

$parts = @()
if ($j.model.display_name) { $parts += $j.model.display_name }
if ($null -ne $ctxLeft) { $parts += "ctx $([math]::Round($ctxLeft))% left" }
if ($null -ne $fiveUsed) { $parts += "5h $([math]::Round($fiveUsed))% used" }
Write-Output ($parts -join " | ")
