$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\preflight.ps1"
$Pnpm = Get-Command pnpm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1
$Node = Get-Command node.exe -ErrorAction Stop
& $Pnpm.Source install
if ($LASTEXITCODE -ne 0) { throw "STOP: pnpm install failed." }
& $Pnpm.Source exec playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "STOP: Playwright Chromium install failed." }
& $Node.Source ".\tests\selftest.mjs"
if ($LASTEXITCODE -ne 0) { throw "STOP: selftest failed." }
Write-Host "[PASS] KK-FRONTEND installed." -ForegroundColor Green
