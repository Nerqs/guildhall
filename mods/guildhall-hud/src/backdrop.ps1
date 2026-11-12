param([Parameter(Mandatory = $true)][string]$Pack)
# The window backdrop: the dark cobblestone floor from the Ninja Adventure pack (CC0, by pixel-boy),
# tiled to 640x360, dimmed so the wood panels stand out, then scaled 3x (1920x1080) with
# nearest-neighbor.  powershell -NoProfile -ExecutionPolicy Bypass -File backdrop.ps1 -Pack "<...>"
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path (Split-Path -Parent $here) "ui\backdrop.png"
$src = [System.Drawing.Image]::FromFile((Join-Path $Pack "Backgrounds\Tilesets\Interior\TilesetInteriorFloor.png"))
$W = 640; $H = 360; $SCALE = 3
$TX = 240; $TY = 192; $TS = 48   # one 48x48 block of dark cobbles
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
for ($y = 0; $y -lt $H; $y += $TS) { for ($x = 0; $x -lt $W; $x += $TS) {
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle $x, $y, $TS, $TS), $TX, $TY, $TS, $TS, [System.Drawing.GraphicsUnit]::Pixel)
} }
$dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(110, 10, 8, 6))
$g.FillRectangle($dim, 0, 0, $W, $H); $dim.Dispose(); $g.Dispose(); $src.Dispose()
$big = New-Object System.Drawing.Bitmap ($W * $SCALE), ($H * $SCALE)
$g2 = [System.Drawing.Graphics]::FromImage($big)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g2.DrawImage($bmp, 0, 0, $W * $SCALE, $H * $SCALE); $g2.Dispose(); $bmp.Dispose()
$big.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $big.Dispose()
"backdrop: $out ($((Get-Item $out).Length / 1KB -as [int]) KB)"
