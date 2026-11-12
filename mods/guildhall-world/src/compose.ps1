# Builds the Guildhall overworld strip from Ninja Adventure tiles (CC0, by pixel-boy).
# Output: ../world.png (native 480x60, scaled 3x with nearest-neighbor) and the fire frames.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File compose.ps1
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Split-Path -Parent $here
$W = 480; $H = 60; $SCALE = 3

$nature = [System.Drawing.Image]::FromFile("$here\TilesetNature.png")
$camp = [System.Drawing.Image]::FromFile("$here\tileset_camp.png")
$fire = [System.Drawing.Image]::FromFile("$here\Fire.png")

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

function Fill($hex, $x, $y, $w, $h) {
  $b = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))
  $g.FillRectangle($b, $x, $y, $w, $h); $b.Dispose()
}
function Blit($img, $sx, $sy, $w, $h, $dx, $dy) {
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle $dx, $dy, $w, $h), $sx, $sy, $w, $h, [System.Drawing.GraphicsUnit]::Pixel)
}

# Ground: field green with lighter tufts, and a dirt road across.
Fill "#74a334" 0 0 $W $H
$rnd = New-Object System.Random 7
for ($i = 0; $i -lt 220; $i++) { Fill "#8fb83e" ($rnd.Next($W)) ($rnd.Next($H)) 1 1 }
for ($i = 0; $i -lt 60; $i++) { $x = $rnd.Next($W); $y = $rnd.Next($H); Fill "#5f8a2a" $x $y 1 2; Fill "#5f8a2a" ($x + 1) ($y - 1) 1 2 }
Fill "#a3754e" 0 37 $W 1
Fill "#d3865f" 0 38 $W 10
Fill "#a3754e" 0 48 $W 1
for ($i = 0; $i -lt 70; $i++) { Fill "#c07650" ($rnd.Next($W)) (39 + $rnd.Next(8)) 2 1 }

# Back row of trees (pine, round, leafy), with gaps; tops run off the strip's edge.
$trees = @(@(32, 0), @(0, 0), @(96, 0), @(32, 0), @(0, 0))
$x = -10; $k = 0
while ($x -lt $W) {
  if ($x -lt 250 -or $x -gt 400) { $t = $trees[$k % $trees.Count]; Blit $nature $t[0] $t[1] 32 32 $x (-10 + ($k % 3) * 2) }
  $x += 22 + ($k * 7) % 14; $k++
}
# Bushes along the road's far side.
foreach ($bx in @(60, 150, 214, 440)) { Blit $nature 256 0 32 32 $bx 6 }

# Camp on the right: a tent and a stone fire pit.
Blit $camp 64 0 48 48 300 -6
Blit $camp 192 80 32 32 360 8

# Fire frames (8 frames of 12x12): two, scaled like the strip.
foreach ($f in 0, 1) {
  $fb = New-Object System.Drawing.Bitmap (12 * $SCALE), (12 * $SCALE)
  $fg = [System.Drawing.Graphics]::FromImage($fb)
  $fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $fg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $fg.DrawImage($fire, (New-Object System.Drawing.Rectangle 0, 0, (12 * $SCALE), (12 * $SCALE)), ($f * 24), 0, 12, 12, [System.Drawing.GraphicsUnit]::Pixel)
  $fg.Dispose(); $fb.Save("$out\fire$f.png", [System.Drawing.Imaging.ImageFormat]::Png); $fb.Dispose()
}

$g.Dispose()
$big = New-Object System.Drawing.Bitmap ($W * $SCALE), ($H * $SCALE)
$bg = [System.Drawing.Graphics]::FromImage($big)
$bg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$bg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$bg.DrawImage($bmp, 0, 0, $W * $SCALE, $H * $SCALE)
$bg.Dispose()
$big.Save("$out\world.png", [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose(); $bmp.Dispose(); $nature.Dispose(); $camp.Dispose(); $fire.Dispose()
"world.png $($W * $SCALE)x$($H * $SCALE)"
