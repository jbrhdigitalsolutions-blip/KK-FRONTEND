$ErrorActionPreference = "Stop"
Write-Host "KK-FRONTEND v0.2 PREFLIGHT" -ForegroundColor Cyan
$node = Get-Command node.exe -ErrorAction Stop
$git = Get-Command git.exe -ErrorAction Stop
$pnpm = Get-Command pnpm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pnpm) { throw "STOP: pnpm.cmd not found. Install/enable pnpm before continuing." }
$NodeVersion = (& $node.Source --version).Trim()
$PnpmVersion = (& $pnpm.Source --version).Trim()
Write-Host "[PASS] Node: $NodeVersion" -ForegroundColor Green
Write-Host "[PASS] pnpm: $PnpmVersion" -ForegroundColor Green
Write-Host "[PASS] Git:  $(git --version)" -ForegroundColor Green
$major = [int]($NodeVersion.TrimStart("v").Split(".")[0])
if ($major -lt 22) { throw "STOP: Node 22+ required." }
try { gh --version | Select-Object -First 1 | ForEach-Object { Write-Host "[INFO] $_" } } catch { Write-Host "[WARN] GitHub CLI not found. Private GitHub target support will be unavailable." -ForegroundColor Yellow }
Write-Host "[PASS] Preflight complete" -ForegroundColor Green
