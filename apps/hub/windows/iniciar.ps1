# Liga o hub Nuvigia no Windows: sobe o go2rtc e depois o hub, e reinicia o hub se ele cair.
# Rode pelo iniciar.cmd. Para desligar, feche a janela ou aperte Ctrl+C.
# -Oculto: usado pela tarefa agendada; manda tudo para apps\hub\data\logs.
param([switch]$Oculto)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$HubDir = Split-Path $PSScriptRoot -Parent
$Go2rtcExe = Join-Path $PSScriptRoot 'bin\go2rtc.exe'
$Go2rtcCfg = Join-Path $HubDir 'go2rtc.yaml'
$LogDir = Join-Path $HubDir 'data\logs'
$HubLog = Join-Path $LogDir 'hub.log'
# Código que o hub usa quando foi desvinculado no app e precisa parear de novo.
$ExitRestart = 75

foreach ($f in @($Go2rtcExe, (Join-Path $HubDir 'dist\index.js'), (Join-Path $HubDir '.env'))) {
  if (-not (Test-Path $f)) {
    Write-Host "Falta $f. Rode o instalar.cmd primeiro." -ForegroundColor Red
    if (-not $Oculto) { Read-Host 'Enter para fechar' | Out-Null }
    exit 1
  }
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $HubDir

function Go2rtc-Responde {
  try {
    Invoke-WebRequest -Uri 'http://127.0.0.1:1984/api' -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch { return $false }
}

# Um go2rtc que ficou de uma execução anterior seguraria as portas.
Get-Process -Name go2rtc -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Go2rtcExe } | Stop-Process -Force

$go2rtc = Start-Process -FilePath $Go2rtcExe -ArgumentList @('-config', "`"$Go2rtcCfg`"") -WorkingDirectory $HubDir `
  -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $LogDir 'go2rtc.log') -RedirectStandardError (Join-Path $LogDir 'go2rtc-erro.log')
$pronto = $false
for ($i = 0; $i -lt 30 -and -not $pronto; $i++) {
  Start-Sleep -Milliseconds 500
  $pronto = Go2rtc-Responde
}
if (-not $pronto) {
  Write-Host "O go2rtc não respondeu. Veja $LogDir\go2rtc-erro.log." -ForegroundColor Red
  Stop-Process -Id $go2rtc.Id -Force -ErrorAction SilentlyContinue
  if (-not $Oculto) { Read-Host 'Enter para fechar' | Out-Null }
  exit 1
}

$env:GO2RTC_URL = 'http://127.0.0.1:1984'
$env:GO2RTC_RTSP = 'rtsp://127.0.0.1:8554'
$nodeArgs = '--env-file=.env --disable-warning=ExperimentalWarning dist\index.js'

try {
  while ($true) {
    if ($Oculto) {
      cmd.exe /d /c "node $nodeArgs >> `"$HubLog`" 2>&1"
    } else {
      Write-Host 'Hub Nuvigia ligado. Página de pareamento: http://localhost:8787  (Ctrl+C para desligar)' -ForegroundColor Green
      cmd.exe /d /c "node $nodeArgs"
    }
    $codigo = $LASTEXITCODE
    if ($codigo -eq 0) { break }
    if ($go2rtc.HasExited) {
      $go2rtc = Start-Process -FilePath $Go2rtcExe -ArgumentList @('-config', "`"$Go2rtcCfg`"") -WorkingDirectory $HubDir `
        -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $LogDir 'go2rtc.log') -RedirectStandardError (Join-Path $LogDir 'go2rtc-erro.log')
      Start-Sleep -Seconds 2
    }
    if ($codigo -eq $ExitRestart) {
      Write-Host 'O hub foi desvinculado no app. Reiniciando para mostrar um código novo...' -ForegroundColor Yellow
    } else {
      Write-Host "O hub parou (código $codigo). Tentando de novo em 10 segundos..." -ForegroundColor Yellow
      Start-Sleep -Seconds 10
    }
  }
} finally {
  Stop-Process -Id $go2rtc.Id -Force -ErrorAction SilentlyContinue
}
