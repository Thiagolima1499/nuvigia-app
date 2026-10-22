# Instala o hub Nuvigia num PC com Windows 10/11, sem Docker.
# Rode pelo instalar.cmd (dois cliques) ou:  powershell -ExecutionPolicy Bypass -File instalar.ps1
# Pode rodar de novo quando quiser: ele só faz o que ainda falta e atualiza o hub.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Go2rtcVersion = '1.9.9'
$PnpmVersion = '10.28.0'
$HubDir = Split-Path $PSScriptRoot -Parent
$RepoDir = Split-Path (Split-Path $HubDir -Parent) -Parent
$BinDir = Join-Path $PSScriptRoot 'bin'
$EnvFile = Join-Path $HubDir '.env'

function Passo($n, $texto) { Write-Host ''; Write-Host "[$n/6] $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "  OK  $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "  !   $texto" -ForegroundColor Yellow }

function Atualizar-Path {
  $maquina = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$maquina;$usuario"
}

function Tem-Winget { return [bool](Get-Command winget -ErrorAction SilentlyContinue) }

function Instalar-Winget($id, $nome) {
  if (-not (Tem-Winget)) {
    throw "Não achei o winget para instalar $nome. Instale o 'Instalador de Aplicativo' pela Microsoft Store e rode este script de novo."
  }
  Write-Host "  Instalando $nome (pode pedir permissão de administrador)..."
  winget install --id $id -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
  Atualizar-Path
}

function Versao-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  $v = (& node --version) -replace '^v', ''
  return [version]$v
}

function Ler-Env($caminho) {
  $valores = @{}
  foreach ($linha in Get-Content $caminho -Encoding UTF8) {
    if ($linha -match '^\s*([A-Z0-9_]+)\s*=(.*)$') { $valores[$Matches[1]] = $Matches[2].Trim() }
  }
  return $valores
}

function Gravar-Env($caminho, $mudancas) {
  $linhas = [System.Collections.Generic.List[string]]::new()
  foreach ($l in Get-Content $caminho -Encoding UTF8) { $linhas.Add($l) }
  foreach ($chave in $mudancas.Keys) {
    $nova = "$chave=$($mudancas[$chave])"
    $achou = $false
    for ($i = 0; $i -lt $linhas.Count; $i++) {
      if ($linhas[$i] -match "^\s*$chave\s*=") { $linhas[$i] = $nova; $achou = $true; break }
    }
    if (-not $achou) { $linhas.Add($nova) }
  }
  # UTF-8 sem BOM: é o que o Node espera no --env-file
  [System.IO.File]::WriteAllLines($caminho, $linhas, [System.Text.UTF8Encoding]::new($false))
}

function Perguntar($texto, $obrigatorio) {
  while ($true) {
    $r = (Read-Host "  $texto").Trim()
    if ($r -or -not $obrigatorio) { return $r }
    Aviso 'Esse valor é obrigatório.'
  }
}

Write-Host 'Instalação do hub Nuvigia no Windows' -ForegroundColor White
Write-Host "Pasta do projeto: $RepoDir"

# 1. Node.js -----------------------------------------------------------------
Passo 1 'Node.js 22.13 ou mais novo'
$nodeV = Versao-Node
if (-not $nodeV -or $nodeV -lt [version]'22.13.0') {
  if ($nodeV) { Aviso "Node $nodeV é antigo demais." }
  Instalar-Winget 'OpenJS.NodeJS.LTS' 'Node.js LTS'
  $nodeV = Versao-Node
  if (-not $nodeV -or $nodeV -lt [version]'22.13.0') {
    throw 'O Node.js foi instalado, mas este terminal ainda não o enxerga. Feche esta janela e rode o instalar.cmd de novo.'
  }
}
Ok "Node $nodeV"

# 2. ffmpeg ------------------------------------------------------------------
Passo 2 'ffmpeg (grava e detecta movimento)'
$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) {
  Instalar-Winget 'Gyan.FFmpeg' 'ffmpeg'
  $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if (-not $ffmpeg) {
    $link = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ffmpeg.exe'
    if (Test-Path $link) { $ffmpeg = Get-Item $link }
  }
  if (-not $ffmpeg) { throw 'O ffmpeg foi instalado, mas não achei o ffmpeg.exe. Feche esta janela e rode o instalar.cmd de novo.' }
}
$ffmpegPath = if ($ffmpeg.Source) { $ffmpeg.Source } else { $ffmpeg.FullName }
Ok $ffmpegPath

# 3. go2rtc ------------------------------------------------------------------
Passo 3 "go2rtc $Go2rtcVersion (conversa com as câmeras e entrega o ao vivo)"
$go2rtcExe = Join-Path $BinDir 'go2rtc.exe'
$go2rtcMarca = Join-Path $BinDir "go2rtc-$Go2rtcVersion.txt"
if (-not (Test-Path $go2rtcExe) -or -not (Test-Path $go2rtcMarca)) {
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $zip = Join-Path $env:TEMP "go2rtc_win64_$Go2rtcVersion.zip"
  $url = "https://github.com/AlexxIT/go2rtc/releases/download/v$Go2rtcVersion/go2rtc_win64.zip"
  Write-Host "  Baixando $url"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $BinDir -Force
  Remove-Item $zip -ErrorAction SilentlyContinue
  Set-Content -Path $go2rtcMarca -Value $Go2rtcVersion
}
Ok $go2rtcExe

# 4. Dependências e build ----------------------------------------------------
Passo 4 'Baixar as dependências e montar o hub (alguns minutos na primeira vez)'
Push-Location $RepoDir
try {
  & npx.cmd --yes "pnpm@$PnpmVersion" install --filter '@nuvigia/hub...'
  if ($LASTEXITCODE -ne 0) { throw "pnpm install falhou (código $LASTEXITCODE)." }
  & npx.cmd --yes "pnpm@$PnpmVersion" --filter '@nuvigia/hub' build
  if ($LASTEXITCODE -ne 0) { throw "O build do hub falhou (código $LASTEXITCODE)." }
} finally {
  Pop-Location
}
Ok (Join-Path $HubDir 'dist\index.js')

# 5. Configuração (.env) -----------------------------------------------------
Passo 5 'Configuração (apps\hub\.env)'
if (-not (Test-Path $EnvFile)) {
  Copy-Item (Join-Path $HubDir '.env.example') $EnvFile
  Write-Host '  Criei o .env a partir do .env.example.'
}
$cfg = Ler-Env $EnvFile
$mudancas = [ordered]@{}

if (-not $cfg['SUPABASE_URL'] -or $cfg['SUPABASE_URL'] -match 'SEU-PROJETO') {
  $mudancas['SUPABASE_URL'] = Perguntar 'SUPABASE_URL (ex.: https://abcd.supabase.co):' $true
}
if (-not $cfg['SUPABASE_ANON_KEY']) {
  $mudancas['SUPABASE_ANON_KEY'] = Perguntar 'SUPABASE_ANON_KEY (chave anon/publishable do Supabase):' $true
}
if (-not $cfg['HUB_REGISTRATION_SECRET']) {
  $mudancas['HUB_REGISTRATION_SECRET'] = Perguntar 'HUB_REGISTRATION_SECRET (o mesmo valor salvo nos Secrets das Edge Functions; Enter para pular):' $false
}
$novaChave = $false
if (-not $cfg['HUB_SECRET_KEY']) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $mudancas['HUB_SECRET_KEY'] = [Convert]::ToBase64String($bytes)
  $novaChave = $true
}
if ($cfg['FFMPEG_PATH'] -ne $ffmpegPath) { $mudancas['FFMPEG_PATH'] = $ffmpegPath }

if ($mudancas.Count -gt 0) { Gravar-Env $EnvFile $mudancas }
Ok $EnvFile
if ($novaChave) {
  Aviso 'Gerei uma HUB_SECRET_KEY nova dentro do .env. Guarde uma cópia do .env num lugar seguro:'
  Aviso 'sem essa chave o hub precisa ser pareado de novo e as câmeras adicionadas de novo.'
}

# 6. Firewall e início automático --------------------------------------------
Passo 6 'Firewall e início automático'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($admin) {
  $regras = @(
    @{ Nome = 'Nuvigia hub (pareamento 8787)'; Protocolo = 'TCP'; Porta = 8787 },
    @{ Nome = 'Nuvigia go2rtc (WebRTC 8555 TCP)'; Protocolo = 'TCP'; Porta = 8555 },
    @{ Nome = 'Nuvigia go2rtc (WebRTC 8555 UDP)'; Protocolo = 'UDP'; Porta = 8555 }
  )
  foreach ($r in $regras) {
    if (-not (Get-NetFirewallRule -DisplayName $r.Nome -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $r.Nome -Direction Inbound -Action Allow -Protocol $r.Protocolo -LocalPort $r.Porta -Profile Private | Out-Null
    }
  }
  Ok 'Portas 8787 e 8555 liberadas na rede privada.'
} else {
  Aviso 'Sem permissão de administrador para mexer no firewall. Quando o Windows perguntar,'
  Aviso 'na primeira vez que o hub abrir, permita o acesso do Node.js e do go2rtc em "Redes privadas".'
}

$tarefa = 'Nuvigia Hub'
$existe = Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
if (-not $existe) {
  $r = Read-Host '  Iniciar o hub sozinho sempre que você entrar no Windows? (s/n)'
  if ($r -match '^[sS]') {
    $iniciar = Join-Path $PSScriptRoot 'iniciar.ps1'
    $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$iniciar`" -Oculto"
    $gatilho = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    try {
      Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilho -Settings $ajustes -Description 'Hub Nuvigia (câmeras)' | Out-Null
      Ok "Tarefa '$tarefa' criada. Os registros ficam em apps\hub\data\logs."
    } catch {
      Aviso "Não consegui criar a tarefa agendada: $($_.Exception.Message)"
    }
  }
} else {
  Ok "Tarefa '$tarefa' já existe."
}

Write-Host ''
Write-Host 'Pronto. Para ligar o hub agora, dê dois cliques em apps\hub\windows\iniciar.cmd.' -ForegroundColor Green
Write-Host 'Ele mostra um código de 6 dígitos para parear no app (também em http://localhost:8787).'
Write-Host 'Deixe o PC sem entrar em suspensão (Configurações > Sistema > Energia), senão o hub para.'
