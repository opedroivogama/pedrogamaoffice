# start.ps1 — Launch Claude Office Visualizer
# Starts backend (:8000) + frontend (:3000) in two new PowerShell windows,
# waits for both, then opens the browser.
#
# Workaround: invokes the venv python directly instead of `uv run` because
# uv's trampoline can't canonicalize paths containing spaces — the project
# path "escritorio online" triggers "uv trampoline failed to canonicalize
# script path". Bypassing uv avoids the bug without renaming the folder.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-Port($port) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $c.Connect("127.0.0.1", $port)
        $c.Close()
        $true
    } catch { $false }
}

# Backend (FastAPI on :8000)
if (Test-Port 8000) {
    Write-Host "Backend already running on :8000 - skipping." -ForegroundColor Yellow
} else {
    $backendPy = Join-Path $root "backend\.venv\Scripts\python.exe"
    if (-not (Test-Path $backendPy)) {
        Write-Host "Backend venv missing at $backendPy. Run 'make install' first." -ForegroundColor Red
        exit 1
    }
    Write-Host "Starting backend on :8000..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit","-Command",@"
Set-Location '$root\backend'
& '$backendPy' -m uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000
"@
}

# Frontend (Next.js on :3000)
if (Test-Port 3000) {
    Write-Host "Frontend already running on :3000 - skipping." -ForegroundColor Yellow
} else {
    Write-Host "Starting frontend on :3000..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit","-Command",@"
Set-Location '$root\frontend'
npm run dev
"@
}

# Wait for both to bind
Write-Host "Waiting up to 60s for both servers to be ready..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
    if ((Test-Port 8000) -and (Test-Port 3000)) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
}

if ($ready) {
    Write-Host "Both servers up. Opening browser..." -ForegroundColor Green
    Start-Process "http://localhost:3000"
} else {
    Write-Host "Timeout. Check the two PowerShell windows for errors." -ForegroundColor Yellow
}
