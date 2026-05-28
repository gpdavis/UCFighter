param(
    [string]$Source = 'c:\git\UCFighter\LegacyApp\data',
    [string]$Dest = 'c:\git\UCFighter\assets\data'
)

Add-Type -AssemblyName System.Drawing

# Colorkey RGB for sprite/UI transparency (verified: #00FF00 pure green)
$keyR = 0; $keyG = 255; $keyB = 0
# Tolerance for near-key pixels (BMP scaling artifacts may produce e.g. 0,254,0)
$tol = 8

# Backgrounds: full-screen opaque, no colorkey needed
$opaquePatterns = @('levelData\\background', 'intro\.bmp$', 'credits\.bmp$', 'help\.bmp$', 'preloading\.bmp$', 'ucfighter\.bmp$', 'uclogo\.bmp$')

function Convert-Bmp {
    param([string]$srcPath, [string]$dstPath, [bool]$keyed)

    $bmp = New-Object System.Drawing.Bitmap($srcPath)
    $w = $bmp.Width; $h = $bmp.Height

    if (-not $keyed) {
        # Opaque background: save as PNG directly (24bpp -> PNG without alpha)
        $bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        return
    }

    # Build a 32bpp ARGB bitmap with colorkey -> alpha=0
    $out = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

    # Lock both bitmaps for fast pixel access
    $srcRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $srcData = $bmp.LockBits($srcRect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $dstData = $out.LockBits($srcRect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

    $srcStride = $srcData.Stride
    $dstStride = $dstData.Stride
    $srcBuf = New-Object byte[] ($srcStride * $h)
    $dstBuf = New-Object byte[] ($dstStride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($srcData.Scan0, $srcBuf, 0, $srcBuf.Length)

    for ($y = 0; $y -lt $h; $y++) {
        $srcRow = $y * $srcStride
        $dstRow = $y * $dstStride
        for ($x = 0; $x -lt $w; $x++) {
            $b = $srcBuf[$srcRow + $x * 3]
            $g = $srcBuf[$srcRow + $x * 3 + 1]
            $r = $srcBuf[$srcRow + $x * 3 + 2]
            $isKey = ([Math]::Abs($r - $keyR) -le $tol) -and ([Math]::Abs($g - $keyG) -le $tol) -and ([Math]::Abs($b - $keyB) -le $tol)
            $dstBuf[$dstRow + $x * 4]     = $b
            $dstBuf[$dstRow + $x * 4 + 1] = $g
            $dstBuf[$dstRow + $x * 4 + 2] = $r
            $dstBuf[$dstRow + $x * 4 + 3] = if ($isKey) { 0 } else { 255 }
        }
    }

    [System.Runtime.InteropServices.Marshal]::Copy($dstBuf, 0, $dstData.Scan0, $dstBuf.Length)
    $bmp.UnlockBits($srcData)
    $out.UnlockBits($dstData)

    $out.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $out.Dispose()
}

$bmps = Get-ChildItem $Source -Recurse -Filter '*.bmp'
$total = $bmps.Count
$i = 0
$srcSize = 0L
$dstSize = 0L
$startTime = Get-Date

foreach ($f in $bmps) {
    $i++
    $rel = $f.FullName.Substring($Source.Length).TrimStart('\','/')
    $dstPath = Join-Path $Dest ([System.IO.Path]::ChangeExtension($rel, '.png'))
    $dstDir = Split-Path $dstPath -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }

    $isOpaque = $false
    foreach ($pat in $opaquePatterns) {
        if ($rel -match $pat) { $isOpaque = $true; break }
    }

    $srcSize += $f.Length
    Convert-Bmp -srcPath $f.FullName -dstPath $dstPath -keyed (-not $isOpaque)
    $dstSize += (Get-Item $dstPath).Length

    if ($i % 5 -eq 0 -or $i -eq $total) {
        $pct = [math]::Round(100 * $i / $total)
        Write-Host "[$i/$total $pct%] $rel"
    }
}

# Copy WAV files unchanged
$wavs = Get-ChildItem $Source -Recurse -Filter '*.wav'
foreach ($f in $wavs) {
    $rel = $f.FullName.Substring($Source.Length).TrimStart('\','/')
    $dstPath = Join-Path $Dest $rel
    $dstDir = Split-Path $dstPath -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
    Copy-Item $f.FullName $dstPath -Force
}

$elapsed = (Get-Date) - $startTime
Write-Host ""
Write-Host "=== Conversion complete ==="
Write-Host "Time:    $([math]::Round($elapsed.TotalSeconds))s"
Write-Host "BMP src: $([math]::Round($srcSize/1MB,1)) MB"
Write-Host "PNG dst: $([math]::Round($dstSize/1MB,1)) MB"
Write-Host "Saved:   $([math]::Round(($srcSize-$dstSize)/1MB,1)) MB ($([math]::Round(100*(1-$dstSize/$srcSize)))% reduction)"
Write-Host "WAVs:    $($wavs.Count) files copied"
