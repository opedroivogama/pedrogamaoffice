$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir  = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

$Host.UI.RawUI.WindowTitle = 'Jurídico Pro — Painel'
Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  Jurídico Pro — painel da empresa'           -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  Backend  -> http://localhost:8000'
Write-Host '  Frontend -> http://localhost:3000  (abre no Microsoft Edge)'
Write-Host ''
Write-Host '  Cada serviço sobe em sua própria janela.'   -ForegroundColor DarkGray
Write-Host '  Feche a janela respectiva pra encerrar.'    -ForegroundColor DarkGray
Write-Host ''

# ---------------------------------------------------------------------------
# Backend (uvicorn)
# ---------------------------------------------------------------------------
# Só sobe se a porta 8000 não estiver escutando — evita duplicar processo
# quando o Pedro clica no atalho duas vezes.
$backendUp = $null -ne (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue)
if ($backendUp) {
    Write-Host '  Backend já está rodando (porta 8000 ocupada). Skipping spawn.' -ForegroundColor DarkYellow
} else {
    $backend = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @(
            '-NoExit',
            '-NoProfile',
            '-Command',
            "`$Host.UI.RawUI.WindowTitle = 'JP Backend (uvicorn)'; Set-Location '$backendDir'; uv run python -X utf8 -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
        ) `
        -WindowStyle Normal `
        -PassThru
    Write-Host "  Backend  PID: $($backend.Id)" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Frontend (next dev)
# ---------------------------------------------------------------------------
$frontendUp = $null -ne (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
if ($frontendUp) {
    Write-Host '  Frontend já está rodando (porta 3000 ocupada). Skipping spawn.' -ForegroundColor DarkYellow
} else {
    $frontend = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @(
            '-NoExit',
            '-NoProfile',
            '-Command',
            "`$Host.UI.RawUI.WindowTitle = 'JP Frontend (next dev)'; Set-Location '$frontendDir'; npm run dev"
        ) `
        -WindowStyle Normal `
        -PassThru
    Write-Host "  Frontend PID: $($frontend.Id)" -ForegroundColor Magenta
}

# ---------------------------------------------------------------------------
# Espera até o frontend de fato responder, depois abre no Edge.
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '  Esperando frontend ficar pronto…' -ForegroundColor DarkGray
$frontUrl = 'http://localhost:3000'
$deadline = (Get-Date).AddSeconds(45)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri $frontUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 800 }
}
if ($ready) {
    Write-Host '  Frontend respondendo. Abrindo no Microsoft Edge…' -ForegroundColor Green
} else {
    Write-Host '  Frontend ainda não respondeu em 45s — abrindo Edge mesmo assim.' -ForegroundColor DarkYellow
}

# Resolve o executável do Edge — caminhos padrão Windows, ou fallback via comando.
$edgePaths = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
)
$edgeExe = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edgeExe) {
    $cmd = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if ($cmd) { $edgeExe = $cmd.Source }
}

if ($edgeExe) {
    Start-Process -FilePath $edgeExe -ArgumentList $frontUrl
} else {
    Write-Host '  Microsoft Edge não localizado — abrindo no browser default.' -ForegroundColor DarkYellow
    Start-Process $frontUrl
}

Write-Host ''
Write-Host '  Lançador concluído. Este terminal pode ser fechado.' -ForegroundColor DarkGray
Write-Host '  As janelas do backend e frontend continuam ativas.' -ForegroundColor DarkGray
