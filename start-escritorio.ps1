$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir  = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

$Host.UI.RawUI.WindowTitle = 'Escritório Digital — Pedro Gama'
Write-Host ''
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host '  Escritório Digital — Pedro Gama' -ForegroundColor Cyan
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host '  Backend  -> http://localhost:8000'
Write-Host '  Frontend -> http://localhost:3000'
Write-Host ''
Write-Host '  Backend e frontend rodam em janelas separadas.' -ForegroundColor DarkGray
Write-Host '  Feche cada janela pra encerrar o respectivo serviço.' -ForegroundColor DarkGray
Write-Host ''

# Usamos Start-Process (não Start-Job) pra que o backend e o frontend virem
# processos independentes deste script. Assim o botão "Reiniciar backend" no
# painel pode matar e ressuscitar o uvicorn sem derrubar o frontend nem este
# wrapper. Cada serviço abre sua própria janela rotulada.

$backend = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @(
        '-NoExit',
        '-NoProfile',
        '-Command',
        "`$Host.UI.RawUI.WindowTitle = 'Backend (uvicorn) — Escritório Digital'; Set-Location '$backendDir'; uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"
    ) `
    -WindowStyle Normal `
    -PassThru

$frontend = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @(
        '-NoExit',
        '-NoProfile',
        '-Command',
        "`$Host.UI.RawUI.WindowTitle = 'Frontend (next dev) — Escritório Digital'; Set-Location '$frontendDir'; npm run dev"
    ) `
    -WindowStyle Normal `
    -PassThru

Write-Host "  Backend  PID: $($backend.Id)" -ForegroundColor Green
Write-Host "  Frontend PID: $($frontend.Id)" -ForegroundColor Magenta
Write-Host ''
Write-Host '  Abrindo http://localhost:3000 em ~8s...' -ForegroundColor DarkGray
Start-Sleep -Seconds 8
Start-Process 'http://localhost:3000'

Write-Host ''
Write-Host '  Lançador concluído. Este terminal pode ser fechado.' -ForegroundColor DarkGray
Write-Host '  As janelas do backend e frontend continuam ativas.' -ForegroundColor DarkGray
