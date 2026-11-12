# Recolors the wood UI pieces (Ninja Adventure, CC0) for every guildhall-* theme, so the sign and
# the buttons follow the theme too. Each pixel keeps its brightness rank and takes the theme color
# for that rank: dark pixels -> the theme's darks, mid tones -> its rim (border), light -> its shine
# (accent). Shading, grain and bevels stay; only the palette changes.
# Output: ../ui/wood/<theme>/<piece>.png. The Wood theme (guildhall) keeps the originals.
#   powershell -NoProfile -ExecutionPolicy Bypass -File recolor.ps1
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$mod = Split-Path -Parent $here
$wood = Join-Path $mod "ui\wood"
$themesDir = Join-Path (Split-Path -Parent (Split-Path -Parent $mod)) "themes"
$pieces = "sign", "sign-inset", "button-normal", "button-hover", "button-pressed", "button-sq-normal", "button-sq-hover", "button-sq-pressed"

function Rgb($hex) { $c = [System.Drawing.ColorTranslator]::FromHtml($hex); return @($c.R, $c.G, $c.B) }
function Lum($r, $g, $b) { return (0.2126 * $r + 0.7152 * $g + 0.0722 * $b) / 255 }
function Mix($a, $b, $t) { return @(([int]($a[0] + ($b[0] - $a[0]) * $t)), ([int]($a[1] + ($b[1] - $a[1]) * $t)), ([int]($a[2] + ($b[2] - $a[2]) * $t))) }

foreach ($tf in Get-ChildItem $themesDir -Filter "guildhall-*.json") {
  $th = Get-Content $tf.FullName -Raw | ConvertFrom-Json
  $c = $th.colors
  # Brightness stops, darkest to lightest, from the theme's own colors.
  $stops = @(
    @(0.00, (Rgb "#131b1b")), @(0.18, (Rgb $c.canvas)), @(0.30, (Rgb $c.chrome)), @(0.42, (Rgb $c.selected)),
    @(0.58, (Rgb $c.border)), @(0.78, (Rgb $c.accent)), @(1.00, (Mix (Rgb $c.accent) @(255, 255, 255) 0.6))
  )
  # The sign's inset holds light text: keep it in the theme's dark range only.
  $insetStops = @(@(0.00, (Rgb "#131b1b")), @(0.45, (Rgb $c.chrome)), @(1.00, (Rgb $c.selected)))
  $out = Join-Path $wood $tf.BaseName
  New-Item -ItemType Directory -Force $out | Out-Null
  $allStops = $stops
  foreach ($p in $pieces) {
    $stops = if ($p -eq "sign-inset") { $insetStops } else { $allStops }
    $src = New-Object System.Drawing.Bitmap (Join-Path $wood "$p.png")
    $rect = New-Object System.Drawing.Rectangle 0, 0, $src.Width, $src.Height
    $data = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bytes = New-Object byte[] ($data.Stride * $src.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    # Rank the image's own brightness range so every piece uses the whole palette.
    $lo = 1.0; $hi = 0.0
    for ($i = 0; $i -lt $bytes.Length; $i += 4) {
      if ($bytes[$i + 3] -lt 16) { continue }
      $l = Lum $bytes[$i + 2] $bytes[$i + 1] $bytes[$i]
      if ($l -lt $lo) { $lo = $l }; if ($l -gt $hi) { $hi = $l }
    }
    $span = [math]::Max(0.001, $hi - $lo)
    $cache = @{}
    for ($i = 0; $i -lt $bytes.Length; $i += 4) {
      if ($bytes[$i + 3] -lt 16) { continue }
      $key = ($bytes[$i + 2] -shl 16) -bor ($bytes[$i + 1] -shl 8) -bor $bytes[$i]
      if (-not $cache.ContainsKey($key)) {
        $t = ((Lum $bytes[$i + 2] $bytes[$i + 1] $bytes[$i]) - $lo) / $span
        $k = 0; while ($k -lt $stops.Count - 2 -and $t -gt $stops[$k + 1][0]) { $k++ }
        $a = $stops[$k]; $b = $stops[$k + 1]
        $cache[$key] = Mix $a[1] $b[1] ([math]::Min(1, [math]::Max(0, ($t - $a[0]) / ($b[0] - $a[0]))))
      }
      $rgb = $cache[$key]
      $bytes[$i + 2] = [byte]$rgb[0]; $bytes[$i + 1] = [byte]$rgb[1]; $bytes[$i] = [byte]$rgb[2]
    }
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
    $src.UnlockBits($data)
    $src.Save((Join-Path $out "$p.png"), [System.Drawing.Imaging.ImageFormat]::Png); $src.Dispose()
  }
  "recolored for $($tf.BaseName)"
}
