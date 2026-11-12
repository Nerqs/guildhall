param([Parameter(Mandatory = $true)][string]$Pack)
# Builds Guildhall's wood UI from the Ninja Adventure "Theme Wood" pieces (CC0, by pixel-boy).
# Herdr can't 9-slice images, so each piece is stretched here to its final size, then
# scaled 2x with nearest-neighbor. Also copies the pack's pixel font.
#   powershell -NoProfile -ExecutionPolicy Bypass -File wood.ps1 -Pack "<...>\Ninja Adventure - Asset Pack"
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$mod = Split-Path -Parent $here
$ui = Join-Path $mod "ui"
$wood = Join-Path $Pack "Ui\Theme\Theme Wood"
New-Item -ItemType Directory -Force (Join-Path $ui "wood"), (Join-Path $mod "fonts") | Out-Null

function NewG($bmp) {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  return $g
}

# 9-slice: keep $b-pixel corners, stretch edges and middle to $w x $h, then scale.
function Slice($src, $dst, $b, $w, $h, $scale) {
  $img = [System.Drawing.Image]::FromFile($src)
  try {
    $sw = $img.Width; $sh = $img.Height
    $mid = New-Object System.Drawing.Bitmap $w, $h
    $g = NewG $mid
    $xs = @(@(0, $b, 0, $b), @($b, ($sw - 2 * $b), $b, ($w - 2 * $b)), @(($sw - $b), $b, ($w - $b), $b))
    $ys = @(@(0, $b, 0, $b), @($b, ($sh - 2 * $b), $b, ($h - 2 * $b)), @(($sh - $b), $b, ($h - $b), $b))
    foreach ($x in $xs) { foreach ($y in $ys) {
      $dest = New-Object System.Drawing.Rectangle $x[2], $y[2], $x[3], $y[3]
      $g.DrawImage($img, $dest, $x[0], $y[0], $x[1], $y[1], [System.Drawing.GraphicsUnit]::Pixel)
    } }
    $g.Dispose()
    $out = New-Object System.Drawing.Bitmap ($w * $scale), ($h * $scale)
    $g2 = NewG $out
    $g2.DrawImage($mid, 0, 0, $w * $scale, $h * $scale)
    $g2.Dispose(); $mid.Dispose()
    $out.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png); $out.Dispose()
  } finally { $img.Dispose() }
}

# One frame of a horizontal strip, scaled.
function Frame($src, $dst, $i, $fw, $fh, $scale) {
  $img = [System.Drawing.Image]::FromFile($src)
  try {
    $out = New-Object System.Drawing.Bitmap ($fw * $scale), ($fh * $scale)
    $g = NewG $out
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, ($fw * $scale), ($fh * $scale)), ($i * $fw), 0, $fw, $fh, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $out.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png); $out.Dispose()
  } finally { $img.Dispose() }
}

$W = Join-Path $ui "wood"
# HUD buttons: 56x20 drawn 2x = 112x40, in three states.
foreach ($s in "normal", "hover", "pressed") { Slice (Join-Path $wood "button_$s.png") (Join-Path $W "button-$s.png") 3 56 20 2 }
# Square icon buttons (MIN): 20x20 drawn 2x = 40x40, in three states.
foreach ($s in "normal", "hover", "pressed") { Slice (Join-Path $wood "button_$s.png") (Join-Path $W "button-sq-$s.png") 3 20 20 2 }
# Label plates (LIFE, SESSION...): the selected tab piece, 34x10 drawn 2x.
Slice (Join-Path $wood "tab_selected.png") (Join-Path $W "plate.png") 3 34 10 2
# The town sign: the wood panel, 132x28 drawn 2x = 264x56, with an inset for the name.
Slice (Join-Path $wood "nine_path_panel.png") (Join-Path $W "sign.png") 4 132 28 2
Slice (Join-Path $wood "nine_path_panel_interior.png") (Join-Path $W "sign-inset.png") 4 112 20 2
# Flags beside the sign: two frames of the red flag strip (16x16), 2x.
$flag = Join-Path $Pack "Backgrounds\Animated\Flag\FlagRed16x16.png"
foreach ($f in 0, 1) { Frame $flag (Join-Path $W "flag$f.png") $f 16 16 2 }
# The pack's pixel font, for the whole UI.
Copy-Item (Join-Path $Pack "Ui\Font\NormalFont.ttf") (Join-Path $mod "fonts\NinjaAdventure.ttf") -Force
"wood: $((Get-ChildItem $W).Count) pieces, font copied"
