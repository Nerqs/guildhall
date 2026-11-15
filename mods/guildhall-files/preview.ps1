# Guildhall Files: copies an image beside the mod so image() can show it (it only reads files
# under Herdr's folder), and prints its size in pixels ("width height"; "0 0" when unknown, e.g. SVG).
# Clears the previous copies first: one preview at a time. Works for \\wsl.localhost paths too.
param(
  [Parameter(Mandatory)][string]$Path,
  [Parameter(Mandatory)][string]$Dir,
  [Parameter(Mandatory)][string]$Name
)
$ErrorActionPreference = "Stop"
$item = Get-Item -LiteralPath $Path
if ($item.Length -gt 25MB) { [Console]::Error.WriteLine("Too large to preview ($([int]($item.Length / 1MB)) MB)"); exit 3 }
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Get-ChildItem -LiteralPath $Dir -File | Remove-Item -Force -ErrorAction SilentlyContinue
$dst = Join-Path $Dir $Name
Copy-Item -LiteralPath $Path -Destination $dst
$w = 0; $h = 0
try {
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile($dst)
  $w = $img.Width; $h = $img.Height
  $img.Dispose()
} catch {}
"$w $h"
