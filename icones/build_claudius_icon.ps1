Add-Type -AssemblyName System.Drawing

$src = "C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\AI_GOLD_HELMET\animations\idle\SOUTH\frame_000.png"
$outDir = "C:\Users\Pedro\Desktop\escritorio online\icones"
$headPng = Join-Path $outDir "claudius_head_full.png"
$icoPath = Join-Path $outDir "claudius_head_full.ico"

$bmp = New-Object System.Drawing.Bitmap $src
$w = $bmp.Width
$h = $bmp.Height
Write-Host "Source: $w x $h"

# Find tight bounding box of non-transparent pixels for the HEAD region only
# (top ~55% of the sprite — covers helmet + sunglasses + chin, excludes body/arms)
$headBottomLimit = [int]($h * 0.55)
$minX = $w; $maxX = 0; $minY = $h; $maxY = 0
for ($y = 0; $y -lt $headBottomLimit; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.A -gt 16) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Host "Head bbox: x=$minX..$maxX  y=$minY..$maxY"

# Add padding so helmet doesn't touch icon edges
$pad = 8
$cropX = [Math]::Max(0, $minX - $pad)
$cropY = [Math]::Max(0, $minY - $pad)
$cropW = [Math]::Min($w - $cropX, ($maxX - $minX) + ($pad * 2))
$cropH = [Math]::Min($h - $cropY, ($maxY - $minY) + ($pad * 2))

# Make it square by extending the smaller dimension symmetrically
$side = [Math]::Max($cropW, $cropH)
$squareX = $cropX - [int](($side - $cropW) / 2)
$squareY = $cropY - [int](($side - $cropH) / 2)

# Build a transparent square canvas and paste the head crop into it
$square = New-Object System.Drawing.Bitmap $side, $side
$gfx = [System.Drawing.Graphics]::FromImage($square)
$gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$gfx.Clear([System.Drawing.Color]::Transparent)

$srcRect = New-Object System.Drawing.Rectangle 0, 0, $side, $side
$srcRect.X = $squareX
$srcRect.Y = $squareY
$dstRect = New-Object System.Drawing.Rectangle 0, 0, $side, $side
$gfx.DrawImage($bmp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$gfx.Dispose()

$square.Save($headPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Wrote $headPng ($side x $side)"

# Build multi-resolution .ico (16, 32, 48, 64, 128, 256)
$sizes = @(16, 32, 48, 64, 128, 256)
$pngBytes = @()
foreach ($s in $sizes) {
    $resized = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($resized)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($square, (New-Object System.Drawing.Rectangle 0, 0, $s, $s))
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes += , $ms.ToArray()
    $resized.Dispose()
    $ms.Dispose()
}

# ICO header
$ico = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ico
$bw.Write([UInt16]0)              # reserved
$bw.Write([UInt16]1)              # type = 1 (ICO)
$bw.Write([UInt16]$sizes.Count)   # count

# Directory entries (16 bytes each)
$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $bytes = $pngBytes[$i]
    $dim = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $bw.Write([byte]$dim)          # width
    $bw.Write([byte]$dim)          # height
    $bw.Write([byte]0)              # color palette
    $bw.Write([byte]0)              # reserved
    $bw.Write([UInt16]1)            # color planes
    $bw.Write([UInt16]32)           # bpp
    $bw.Write([UInt32]$bytes.Length) # size
    $bw.Write([UInt32]$offset)       # offset
    $offset += $bytes.Length
}

# Image data
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $bw.Write($pngBytes[$i])
}

[System.IO.File]::WriteAllBytes($icoPath, $ico.ToArray())
$bw.Dispose()
$ico.Dispose()
$square.Dispose()
$bmp.Dispose()

Write-Host "Wrote $icoPath ($($((Get-Item $icoPath).Length)) bytes)"
