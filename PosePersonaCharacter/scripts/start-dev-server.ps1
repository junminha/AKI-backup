$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot "logs"
$standardLog = Join-Path $logDirectory "dev-server.log"
$errorLog = Join-Path $logDirectory "dev-server-error.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

# Avoid opening a second Vite instance when the server is already listening.
$existingListener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($existingListener) {
  exit 0
}

$npmCommand = Get-Command "npm.cmd" -ErrorAction Stop
Start-Process `
  -FilePath $npmCommand.Source `
  -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0") `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $standardLog `
  -RedirectStandardError $errorLog
