param([Parameter(Mandatory = $true)][string]$Src, [Parameter(Mandatory = $true)][string]$Sheet, [int]$MinArea = 120)
# Finds each separate sprite in a tileset (8-connected opaque pixels), prints their boxes as
# "i x y w h", and saves a 2x sheet with each box outlined and numbered, to pick pieces by number.
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap $Src
$W = $bmp.Width; $H = $bmp.Height
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($data.Stride * $H)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$stride = $data.Stride
$bmp.UnlockBits($data)
$seen = New-Object bool[] ($W * $H)
$boxes = New-Object System.Collections.ArrayList
for ($y = 0; $y -lt $H; $y++) { for ($x = 0; $x -lt $W; $x++) {
  $i = $y * $W + $x
  if ($seen[$i] -or $bytes[$y * $stride + $x * 4 + 3] -lt 16) { continue }
  $stack = New-Object System.Collections.Generic.Stack[int]; $stack.Push($i); $seen[$i] = $true
  $x0 = $x; $x1 = $x; $y0 = $y; $y1 = $y; $n = 0
  while ($stack.Count) {
    $p = $stack.Pop(); $px = $p % $W; $py = [math]::Floor($p / $W); $n++
    if ($px -lt $x0) { $x0 = $px }; if ($px -gt $x1) { $x1 = $px }; if ($py -lt $y0) { $y0 = $py }; if ($py -gt $y1) { $y1 = $py }
    for ($dy = -1; $dy -le 1; $dy++) { for ($dx = -1; $dx -le 1; $dx++) {
      $nx = $px + $dx; $ny = $py + $dy
      if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $W -or $ny -ge $H) { continue }
      $q = $ny * $W + $nx
      if (-not $seen[$q] -and $bytes[$ny * $stride + $nx * 4 + 3] -ge 16) { $seen[$q] = $true; $stack.Push($q) }
    } }
  }
  if ($n -ge $MinArea) { [void]$boxes.Add(@($x0, $y0, ($x1 - $x0 + 1), ($y1 - $y0 + 1))) }
} }
$out = New-Object System.Drawing.Bitmap ($W * 2), ($H * 2)
$g = [System.Drawing.Graphics]::FromImage($out)
$g.Clear([System.Drawing.Color]::FromArgb(255, 40, 44, 52))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.DrawImage($bmp, 0, 0, $W * 2, $H * 2)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::Cyan), 1
$font = New-Object System.Drawing.Font "Arial", 9, ([System.Drawing.FontStyle]::Bold)
for ($k = 0; $k -lt $boxes.Count; $k++) {
  $b = $boxes[$k]
  $g.DrawRectangle($pen, $b[0] * 2, $b[1] * 2, $b[2] * 2, $b[3] * 2)
  $g.FillRectangle([System.Drawing.Brushes]::Black, $b[0] * 2, $b[1] * 2, 18, 12)
  $g.DrawString("$k", $font, [System.Drawing.Brushes]::Yellow, $b[0] * 2, $b[1] * 2 - 1)
  "$k $($b -join ' ')"
}
$g.Dispose(); $out.Save($Sheet, [System.Drawing.Imaging.ImageFormat]::Png); $out.Dispose(); $bmp.Dispose()
