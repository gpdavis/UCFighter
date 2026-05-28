param(
    [string]$Root = 'c:\git\UCFighter',
    [int]$Port = 8765
)

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.mjs'  = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.bmp'  = 'image/bmp'
    '.wav'  = 'audio/wav'
    '.mp3'  = 'audio/mpeg'
    '.ogg'  = 'audio/ogg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.md'   = 'text/markdown; charset=utf-8'
    '.txt'  = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try {
    $listener.Start()
} catch {
    Write-Host "Failed to start listener on port $Port`: $($_.Exception.Message)"
    exit 1
}
Write-Host "Serving $Root at http://localhost:$Port/ — Ctrl+C to stop"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        try {
            $relPath = [System.Web.HttpUtility]::UrlDecode($req.Url.AbsolutePath.TrimStart('/'))
            if ([string]::IsNullOrEmpty($relPath)) {
                $relPath = 'index.html'
            } elseif ($relPath.EndsWith('/')) {
                $relPath = $relPath + 'index.html'
            }
            $fullPath = Join-Path $Root $relPath

            if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                $res.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404: $relPath")
                $res.OutputStream.Write($msg, 0, $msg.Length)
            } else {
                $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
                $type = $mime[$ext]
                if (-not $type) { $type = 'application/octet-stream' }
                $res.ContentType = $type
                $fileInfo = Get-Item -LiteralPath $fullPath
                $res.ContentLength64 = $fileInfo.Length
                if ($req.HttpMethod -ne 'HEAD') {
                    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            }
            Write-Host "[$($res.StatusCode)] $($req.HttpMethod) $relPath"
        } catch {
            $res.StatusCode = 500
            Write-Host "[500] $($req.Url.AbsolutePath): $($_.Exception.Message)"
        } finally {
            try {
                $res.Close()
            } catch {
                # ignore
            }
        }
    }
} finally {
    $listener.Stop()
}
