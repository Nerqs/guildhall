param([Parameter(Mandatory = $true)][string]$Pack)
# Builds Guildhall's overworld maps from Ninja Adventure tiles (CC0, by pixel-boy): strips of
# 800x56, scaled 2x (1600x112) with nearest-neighbor, into ../maps/<name>.png.
# Every map keeps the same landmarks so heroes know where to go (native px):
#   a door on the left (x 20-84, "needs you"), the road (y 38-48, "working"),
#   an open chest (x 600, "done") and a fire pit (x 700, "idle").
#   powershell -NoProfile -ExecutionPolicy Bypass -File maps.ps1 -Pack "<...>\Ninja Adventure - Asset Pack"
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path (Split-Path -Parent $here) "maps"
New-Item -ItemType Directory -Force $outDir | Out-Null
$T = Join-Path $Pack "Backgrounds\Tilesets"
$img = @{
  nature = [System.Drawing.Image]::FromFile("$T\TilesetNature.png")
  house  = [System.Drawing.Image]::FromFile("$T\TilesetHouse.png")
  towers = [System.Drawing.Image]::FromFile("$T\TilesetTowers.png")
  camp   = [System.Drawing.Image]::FromFile("$T\tileset_camp.png")
  chest  = [System.Drawing.Image]::FromFile((Join-Path $Pack "Items\Treasure\BigTreasureChest.png"))
}
$W = 800; $H = 56; $SCALE = 2

function Map($name, $ground, $road, $roadEdge, $speck, $items) {
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $fill = { param($hex, $x, $y, $w, $h) $b = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex)); $g.FillRectangle($b, $x, $y, $w, $h); $b.Dispose() }
  & $fill $ground 0 0 $W $H
  $rnd = New-Object System.Random ($name.Length * 97)
  for ($i = 0; $i -lt 260; $i++) { & $fill $speck ($rnd.Next($W)) ($rnd.Next($H)) 1 1 }
  & $fill $roadEdge 0 37 $W 1; & $fill $road 0 38 $W 10; & $fill $roadEdge 0 48 $W 1
  for ($i = 0; $i -lt 90; $i++) { & $fill $roadEdge ($rnd.Next($W)) (39 + $rnd.Next(8)) 2 1 }
  # Items: @(sheet, sx, sy, w, h, dx, dy), drawn in order (back to front).
  foreach ($it in $items) {
    $g.DrawImage($img[$it[0]], (New-Object System.Drawing.Rectangle $it[5], $it[6], $it[3], $it[4]), $it[1], $it[2], $it[3], $it[4], [System.Drawing.GraphicsUnit]::Pixel)
  }
  $g.Dispose()
  $big = New-Object System.Drawing.Bitmap ($W * $SCALE), ($H * $SCALE)
  $g2 = [System.Drawing.Graphics]::FromImage($big)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g2.DrawImage($bmp, 0, 0, $W * $SCALE, $H * $SCALE); $g2.Dispose(); $bmp.Dispose()
  $big.Save((Join-Path $outDir "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png); $big.Dispose()
  "map $name"
}

# A row of trees along the back, skipping the given x ranges.
function Trees($kinds, $skip) {
  $list = @(); $x = -12; $k = 0
  while ($x -lt $W) {
    $free = $true; foreach ($s in $skip) { if ($x + 32 -gt $s[0] -and $x -lt $s[1]) { $free = $false } }
    if ($free) { $t = $kinds[$k % $kinds.Count]; $list += , @("nature", $t[0], $t[1], 32, 32, $x, (-14 + ($k % 3) * 2)) }
    $x += 20 + ($k * 7) % 12; $k++
  }
  return $list
}
# The shared landmarks: open chest (frame 2 of 2) and the fire pit.
$landmarks = @(@("chest", 16, 0, 16, 14, 604, 30), @("camp", 192, 80, 32, 32, 696, 14))

# Village: houses and shops along the road.
$items = Trees @(@(32, 0), @(0, 0), @(96, 0)) @(@(10, 130), @(180, 520))
$items += , @("house", 0, 0, 63, 48, 20, -8)        # orange house (the door: needs you)
$items += , @("house", 256, 0, 48, 48, 200, -8)     # shop with a sign
$items += , @("house", 192, 0, 64, 48, 280, -8)     # red-roof house
$items += , @("house", 304, 0, 64, 48, 380, -8)     # green-roof shop
$items += , @("house", 416, 0, 48, 48, 470, -8)     # gable house
$items += , @("nature", 256, 0, 32, 32, 150, 6); $items += , @("nature", 256, 0, 32, 32, 540, 6)
Map "village" "#74a334" "#d3865f" "#a3754e" "#8fb83e" ($items + $landmarks)

# Camp: forest, tents and the pit.
$items = Trees @(@(32, 0), @(0, 0), @(96, 0), @(32, 0)) @(@(10, 90))
$items += , @("camp", 64, 0, 48, 48, 24, -8)        # tent (the door)
$items += , @("camp", 112, 0, 48, 48, 300, -8); $items += , @("camp", 160, 0, 48, 48, 470, -8)
$items += , @("nature", 256, 0, 32, 32, 200, 6); $items += , @("nature", 288, 0, 32, 32, 400, 6)
Map "camp" "#5f8a2a" "#c07650" "#8a5a36" "#74a334" ($items + $landmarks)

# Snowfield: igloos and snowy pines.
$items = Trees @(@(160, 0), @(128, 0), @(192, 0)) @(@(10, 90), @(250, 360))
$items += , @("house", 0, 176, 48, 46, 30, -6)       # igloo (the door)
$items += , @("house", 55, 176, 34, 46, 270, -6); $items += , @("house", 96, 176, 48, 46, 310, -6)
Map "snowfield" "#dfe8f0" "#b8c8d8" "#98a8bc" "#ffffff" ($items + $landmarks)

# Shrine: a gate, pagodas and statues.
$items = Trees @(@(224, 0), @(0, 0), @(224, 0), @(32, 0)) @(@(10, 90), @(170, 230), @(330, 520))
$items += , @("house", 7, 82, 34, 29, 40, 9)          # torii gate (waiting at the gate)
$items += , @("towers", 288, 32, 32, 32, 180, 4)       # pagoda
$items += , @("house", 49, 242, 30, 30, 340, 7); $items += , @("house", 49, 306, 30, 30, 380, 7)  # statues
$items += , @("towers", 320, 32, 32, 32, 440, 4); $items += , @("towers", 288, 32, 32, 32, 490, 4)
Map "shrine" "#7aa04a" "#cfc2a0" "#a89a78" "#8fb83e" ($items + $landmarks)

foreach ($k in @($img.Keys)) { $img[$k].Dispose() }
