# Arranca o MariaDB local do projecto (porta 3307), se ainda nao estiver a escuta.
$ErrorActionPreference = "Stop"
$serverRoot = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $serverRoot ".mysql-data"
$mysqld = "C:\Program Files\MariaDB 13.0\bin\mysqld.exe"
$defaults = Join-Path $dataDir "my.ini"

if (-not (Test-Path $mysqld)) {
  Write-Error "MariaDB nao encontrado em $mysqld. Instale com: winget install MariaDB.Server"
}

if (-not (Test-Path $defaults)) {
  Write-Error "Datadir em falta: $dataDir. Recrie com mysql_install_db."
}

$listening = Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host "MariaDB ja esta a escuta na porta 3307."
  exit 0
}

Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=$defaults" -WindowStyle Hidden
Start-Sleep -Seconds 3

$ok = Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue
if (-not $ok) {
  Write-Error "Falha ao arrancar MariaDB na porta 3307."
}

Write-Host "MariaDB arrancado em 127.0.0.1:3307 (base kwanza_news)."
