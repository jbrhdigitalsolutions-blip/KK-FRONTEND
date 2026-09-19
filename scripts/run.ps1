$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
if (-not (Test-Path -LiteralPath "$Root\node_modules" -PathType Container)) { throw "STOP: node_modules missing. Run scripts\install.ps1 first." }
$Node = Get-Command node.exe -ErrorAction Stop
& $Node.Source ".\src\server.mjs"
