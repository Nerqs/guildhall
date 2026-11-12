param([Parameter(Mandatory = $true)][string]$Pack)
# Pulls the Guildhall UI pieces out of the Ninja Adventure Asset Pack (CC0, by pixel-boy)
# into ../ui, upscaled with nearest-neighbor so the pixels stay crisp.
#   powershell -NoProfile -ExecutionPolicy Bypass -File extract.ps1 -Pack "<...>\Ninja Adventure - Asset Pack"
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ui = Join-Path (Split-Path -Parent $here) "ui"
New-Item -ItemType Directory -Force $ui, "$ui\sounds", "$ui\icons" | Out-Null

function Crop($src, $dst, $x, $y, $w, $h, $scale) {
  $img = [System.Drawing.Image]::FromFile($src)
  try {
    $out = New-Object System.Drawing.Bitmap ($w * $scale), ($h * $scale)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, ($w * $scale), ($h * $scale)), $x, $y, $w, $h, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $out.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png); $out.Dispose()
  } finally { $img.Dispose() }
}
function Whole($src, $dst, $scale) {
  $img = [System.Drawing.Image]::FromFile($src); $w = $img.Width; $h = $img.Height; $img.Dispose()
  Crop $src $dst 0 0 $w $h $scale
}

$U = Join-Path $Pack "Ui"
# Life hearts: empty, 1/4, 1/2, 3/4, full (16x16 each), drawn 2x.
for ($i = 0; $i -le 4; $i++) { Crop "$U\Receptacle\Heart.png" "$ui\heart$i.png" ($i * 16) 0 16 16 2 }
# Status emotes, drawn 2x: working "...", blocked red "!", done star, idle "Zz", love heart.
$emotes = @{ working = 20; blocked = 22; done = 29; idle = 28; love = 27; question = 23 }
foreach ($k in $emotes.Keys) { Whole "$U\Emote\emote$($emotes[$k]).png" "$ui\emote-$k.png" 2 }
# The dialog portrait frame, drawn 2x.
Whole "$U\Dialog\FacesetBox.png" "$ui\faceset-box.png" 2
# Place icons for spaces and action icons, drawn 2x.
$icons = Get-ChildItem "$U\Skill Icon" -Recurse -File -Filter *.png | Where-Object { $_.BaseName -notmatch 'Disabled|Preview' }
foreach ($f in $icons) { Whole $f.FullName "$ui\icons\$($f.BaseName).png" 2 }
# Sounds: a short fanfare when an agent finishes, an alert when one needs you.
Copy-Item "$Pack\Audio\Jingles\Success1.wav" "$ui\sounds\done.wav" -Force
Copy-Item "$Pack\Audio\Sounds\Alert\Alert2.wav" "$ui\sounds\blocked.wav" -Force
Copy-Item "$Pack\LICENSE.txt" "$ui\LICENSE-NinjaAdventure.txt" -Force
"ui: $((Get-ChildItem $ui -Recurse -File).Count) files"
