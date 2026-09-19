$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSCommandPath
Set-Location -LiteralPath $Root
Write-Host "KK-FRONTEND v0.2 FAST-DEEP START" -ForegroundColor Cyan
pwsh -NoProfile -ExecutionPolicy Bypass -File "$Root\scripts\preflight.ps1"
$Pnpm = Get-Command pnpm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1
$Node = Get-Command node.exe -ErrorAction Stop
if (-not (Test-Path -LiteralPath "$Root\node_modules" -PathType Container)) {
    Write-Host "Installing dependencies with pnpm..." -ForegroundColor Cyan
    & $Pnpm.Source install
    if ($LASTEXITCODE -ne 0) { throw "STOP: pnpm install failed." }
    Write-Host "Installing Playwright Chromium..." -ForegroundColor Cyan
    & $Pnpm.Source exec playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw "STOP: Playwright Chromium install failed." }
}
Write-Host "Running selftest..." -ForegroundColor Cyan
& $Node.Source ".\tests\selftest.mjs"
if ($LASTEXITCODE -ne 0) { throw "STOP: selftest failed." }
Write-Host "Starting http://127.0.0.1:4317" -ForegroundColor Green
& $Node.Source ".\src\server.mjs"
