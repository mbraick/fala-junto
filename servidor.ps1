# Fala Junto - servidor local para testar no Windows (sem instalar nada)
# Abre o app em http://localhost:8765 no navegador padrao.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$port = 8765
$prefix = "http://localhost:$port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
} catch {
    Write-Host "A porta $port ja esta em uso. Abrindo o app que ja esta rodando..."
    try { Start-Process $prefix } catch {}
    exit
}

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'
    '.svg' = 'image/svg+xml'
    '.png' = 'image/png'
    '.jpg' = 'image/jpeg'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.md' = 'text/plain; charset=utf-8'
}

Write-Host ""
Write-Host "  Fala Junto esta rodando em $prefix"
Write-Host "  Para instalar: no Edge ou Chrome, clique no icone de instalar na barra de endereco."
Write-Host "  Depois de instalado, o app funciona mesmo com esta janela fechada."
Write-Host "  Para parar o servidor, feche esta janela."
Write-Host ""
try { Start-Process $prefix } catch { Write-Host "Abra no navegador: $prefix" }

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
        if ($rel -eq '') { $rel = 'index.html' }
        $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
        if ($full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
            $bytes = [IO.File]::ReadAllBytes($full)
            $ext = [IO.Path]::GetExtension($full).ToLower()
            if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
            if ($rel -eq 'sw.js' -or $rel -eq 'index.html') { $ctx.Response.Headers.Add('Cache-Control', 'no-cache') }
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
        }
    } catch {
        $ctx.Response.StatusCode = 500
    } finally {
        $ctx.Response.Close()
    }
}
