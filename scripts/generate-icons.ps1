# Renders the PitchProof icon (shield, pitch markings, gold check badge) into assets/.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
param([string]$OutDir = (Join-Path $PSScriptRoot '..\assets'))
Add-Type -AssemblyName System.Drawing
$OutDir = (Resolve-Path $OutDir).Path

function New-Color([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

# Shield centred on a 1024 canvas. Coordinates are in canvas units before scaling.
function New-ShieldPath([float]$s, [float]$ox, [float]$oy) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pt = { param($x, $y) New-Object System.Drawing.PointF(($ox + $x * $s), ($oy + $y * $s)) }
  $p.AddBezier((& $pt 512 196), (& $pt 600 262), (& $pt 700 286), (& $pt 806 292))
  $p.AddLine((& $pt 806 292), (& $pt 806 520))
  $p.AddBezier((& $pt 806 520), (& $pt 806 700), (& $pt 690 818), (& $pt 512 880))
  $p.AddBezier((& $pt 512 880), (& $pt 334 818), (& $pt 218 700), (& $pt 218 520))
  $p.AddLine((& $pt 218 520), (& $pt 218 292))
  $p.AddBezier((& $pt 218 292), (& $pt 324 286), (& $pt 424 262), (& $pt 512 196))
  $p.CloseFigure()
  return $p
}

function Draw-Mark($g, [float]$s, [float]$ox, [float]$oy, [string]$checkHex) {
  $shield = New-ShieldPath $s $ox $oy
  $g.FillPath((New-Object System.Drawing.SolidBrush (New-Color '#2FBF71')), $shield)

  $g.SetClip($shield)
  $white = New-Object System.Drawing.Pen ((New-Color '#FFFFFF'), (30 * $s))
  $white.StartCap = 'Round'; $white.EndCap = 'Round'
  # Halfway line across the full shield height, so it reads as a pitch, not a symbol.
  $g.DrawLine($white, ($ox + 512 * $s), ($oy + 180 * $s), ($ox + 512 * $s), ($oy + 900 * $s))
  $r = 118 * $s
  $g.DrawEllipse($white, ($ox + 512 * $s - $r), ($oy + 470 * $s - $r), (2 * $r), (2 * $r))
  $g.ResetClip()

  # Signature check on a dark badge at the lower right, overlapping the shield edge.
  $badgeR = 118 * $s; $bx = $ox + 742 * $s; $by = $oy + 768 * $s
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (New-Color '#121110')), ($bx - $badgeR - 14 * $s), ($by - $badgeR - 14 * $s), (2 * ($badgeR + 14 * $s)), (2 * ($badgeR + 14 * $s)))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (New-Color $checkHex)), ($bx - $badgeR), ($by - $badgeR), (2 * $badgeR), (2 * $badgeR))
  $check = New-Object System.Drawing.Pen ((New-Color '#121110'), (34 * $s))
  $check.StartCap = 'Round'; $check.EndCap = 'Round'; $check.LineJoin = 'Round'
  $pts = @(
    (New-Object System.Drawing.PointF(($bx - 52 * $s), ($by + 2 * $s))),
    (New-Object System.Drawing.PointF(($bx - 14 * $s), ($by + 40 * $s))),
    (New-Object System.Drawing.PointF(($bx + 56 * $s), ($by - 36 * $s)))
  )
  $g.DrawLines($check, $pts)
}

function Render([int]$size, [string]$checkHex, [string]$bgHex, [float]$markScale, [string]$path, [bool]$transparent) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
  if ($transparent) { $g.Clear([System.Drawing.Color]::Transparent) } else { $g.Clear((New-Color $bgHex)) }
  $s = ($size / 1024.0) * $markScale
  $offset = ($size - 1024 * $s) / 2
  Draw-Mark $g $s $offset ($offset + 6 * $s) $checkHex
  $g.Dispose()
  if ($transparent) {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  } else {
    # App Store icons must have no alpha channel.
    $rgb = $bmp.Clone((New-Object System.Drawing.Rectangle 0, 0, $size, $size), [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $rgb.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $rgb.Dispose()
  }
  $bmp.Dispose()
  $path
}

$gold = '#E0B23A'
$background = '#121110'
# App Store / home screen icon: 1024x1024, opaque.
Render 1024 $gold $background 1.0 (Join-Path $OutDir 'icon.png') $false
# Splash mark on transparent background; app.json supplies the matching background colour.
Render 1024 $gold $background 0.8 (Join-Path $OutDir 'splash-icon.png') $true
# Android adaptive foreground: keep the mark inside the 66% safe zone.
Render 1024 $gold $background 0.62 (Join-Path $OutDir 'adaptive-icon.png') $true
Render 48 $gold $background 1.0 (Join-Path $OutDir 'favicon.png') $false
