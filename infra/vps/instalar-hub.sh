#!/usr/bin/env bash
# Instala o hub Nuvigia numa VPS (Ubuntu 22.04/24.04 ou Debian 12) ligada por WireGuard
# ao roteador da rede das câmeras. Assim não fica nenhum equipamento extra no local.
#
#   curl -fsSL https://raw.githubusercontent.com/Thiagolima1499/nuvigia-app/main/infra/vps/instalar-hub.sh -o instalar-hub.sh
#   sudo bash instalar-hub.sh
#
# Pode rodar de novo: mantém as chaves da VPN e o .env, e atualiza o hub.
# Guia completo: docs/hub-na-nuvem.md
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Thiagolima1499/nuvigia-app.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/nuvigia-app}"
WG_DIR=/etc/wireguard
WG_PORT="${WG_PORT:-51820}"
WG_NET="${WG_NET:-10.13.13}"          # VPS = .1, roteador = .2
ROTEADOR_CONF=/root/nuvigia-roteador.conf
STATE=/etc/nuvigia-vps.env             # lembra a rede das câmeras entre execuções

passo() { printf '\n\033[1;36m[%s] %s\033[0m\n' "$1" "$2"; }
ok() { printf '  \033[32mOK\033[0m  %s\n' "$1"; }
aviso() { printf '  \033[33m!\033[0m   %s\n' "$1"; }
perguntar() { # perguntar VAR "texto" [obrigatório=1]
  local __v=""
  while :; do
    read -r -p "  $2 " __v </dev/tty || true
    [[ -n "$__v" || "${3:-1}" == 0 ]] && break
    aviso 'Esse valor é obrigatório.'
  done
  printf -v "$1" '%s' "$__v"
}
env_get() { grep -E "^$1=" "$2" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }
env_set() { # env_set CHAVE valor arquivo
  local tmp; tmp=$(mktemp)
  if grep -qE "^$1=" "$3"; then
    awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' "$3" >"$tmp"
  else
    cat "$3" >"$tmp"; printf '%s=%s\n' "$1" "$2" >>"$tmp"
  fi
  cat "$tmp" >"$3"; rm -f "$tmp"
}

[[ $EUID -eq 0 ]] || { echo 'Rode como root: sudo bash instalar-hub.sh'; exit 1; }
[[ -r /etc/os-release ]] && . /etc/os-release
[[ "${ID:-}" == ubuntu || "${ID:-}" == debian ]] || aviso "Feito para Ubuntu/Debian; este sistema é ${PRETTY_NAME:-desconhecido}."

# 1. Pacotes ------------------------------------------------------------------
passo 1/6 'Pacotes (WireGuard, Docker, git)'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq wireguard-tools git curl openssl ufw iproute2 >/dev/null
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null
ok "$(docker --version)"

# 2. Rede das câmeras -----------------------------------------------------------
passo 2/6 'Rede das câmeras'
[[ -r $STATE ]] && . "$STATE"
if [[ -z "${CAMERA_SUBNET:-}" ]]; then
  echo '  Qual é a faixa de IPs da rede das câmeras? Veja no roteador (ex.: 192.168.50.0/24).'
  perguntar CAMERA_SUBNET 'Rede das câmeras:'
fi
[[ "$CAMERA_SUBNET" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] || { echo "Faixa inválida: $CAMERA_SUBNET"; exit 1; }
if [[ "$CAMERA_SUBNET" == "$WG_NET".* ]]; then echo "A rede das câmeras não pode ser $WG_NET.0/24 (é a da VPN)."; exit 1; fi
if [[ -z "${PUBLIC_IP:-}" ]]; then
  PUBLIC_IP=$(curl -fsS4 --max-time 5 https://api.ipify.org || true)
  [[ -n "$PUBLIC_IP" ]] || perguntar PUBLIC_IP 'IP público desta VPS:'
fi
printf 'CAMERA_SUBNET=%s\nPUBLIC_IP=%s\n' "$CAMERA_SUBNET" "$PUBLIC_IP" >"$STATE"
ok "câmeras em $CAMERA_SUBNET, VPS em $PUBLIC_IP"

# 3. WireGuard ------------------------------------------------------------------
passo 3/6 "VPN WireGuard (porta $WG_PORT/udp)"
umask 077
mkdir -p "$WG_DIR"
for k in vps roteador; do
  [[ -s "$WG_DIR/nuvigia-$k.key" ]] || wg genkey >"$WG_DIR/nuvigia-$k.key"
  wg pubkey <"$WG_DIR/nuvigia-$k.key" >"$WG_DIR/nuvigia-$k.pub"
done
cat >"$WG_DIR/nuvigia.conf" <<EOF
# Gerado por instalar-hub.sh. A VPS só alcança a rede das câmeras; o roteador
# não manda o resto da internet de casa por aqui.
[Interface]
Address = $WG_NET.1/24
ListenPort = $WG_PORT
PrivateKey = $(cat "$WG_DIR/nuvigia-vps.key")

[Peer]
# roteador da rede das câmeras
PublicKey = $(cat "$WG_DIR/nuvigia-roteador.pub")
AllowedIPs = $WG_NET.2/32, $CAMERA_SUBNET
EOF
cat >"$ROTEADOR_CONF" <<EOF
# Configuração WireGuard do ROTEADOR da rede das câmeras (importe no roteador).
# Guarde com cuidado: tem a chave privada do roteador.
[Interface]
PrivateKey = $(cat "$WG_DIR/nuvigia-roteador.key")
Address = $WG_NET.2/24

[Peer]
# VPS do hub Nuvigia
PublicKey = $(cat "$WG_DIR/nuvigia-vps.pub")
Endpoint = $PUBLIC_IP:$WG_PORT
AllowedIPs = $WG_NET.1/32
PersistentKeepalive = 25
EOF
umask 022
systemctl enable wg-quick@nuvigia >/dev/null 2>&1
systemctl restart wg-quick@nuvigia
ok "VPN no ar; configuração do roteador em $ROTEADOR_CONF"

# 4. Firewall -------------------------------------------------------------------
passo 4/6 'Firewall'
ufw allow OpenSSH >/dev/null
ufw allow "$WG_PORT/udp" comment 'Nuvigia WireGuard' >/dev/null
ufw allow 8555/tcp comment 'Nuvigia ao vivo (WebRTC)' >/dev/null
ufw allow 8555/udp comment 'Nuvigia ao vivo (WebRTC)' >/dev/null
ufw --force enable >/dev/null
ok "abertas: SSH, $WG_PORT/udp e 8555 (tcp/udp). A página de pareamento (8787) fica fechada."
aviso "Libere as mesmas portas também no painel do provedor (security group / firewall da VPS)."

# 5. Hub ------------------------------------------------------------------------
passo 5/6 'Hub (download e configuração)'
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch -q origin "$REPO_BRANCH"
  git -C "$APP_DIR" checkout -q "$REPO_BRANCH"
  git -C "$APP_DIR" reset -q --hard "origin/$REPO_BRANCH"
else
  git clone -q --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi
ENV_FILE="$APP_DIR/apps/hub/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/apps/hub/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
v=$(env_get SUPABASE_URL "$ENV_FILE")
if [[ -z "$v" || "$v" == *SEU-PROJETO* ]]; then perguntar v 'SUPABASE_URL (ex.: https://abcd.supabase.co):'; env_set SUPABASE_URL "$v" "$ENV_FILE"; fi
v=$(env_get SUPABASE_ANON_KEY "$ENV_FILE")
if [[ -z "$v" ]]; then perguntar v 'SUPABASE_ANON_KEY:'; env_set SUPABASE_ANON_KEY "$v" "$ENV_FILE"; fi
v=$(env_get HUB_REGISTRATION_SECRET "$ENV_FILE")
if [[ -z "$v" ]]; then perguntar v 'HUB_REGISTRATION_SECRET (o mesmo dos Secrets do Supabase; Enter para pular):' 0; env_set HUB_REGISTRATION_SECRET "$v" "$ENV_FILE"; fi
NOVA_CHAVE=0
if [[ -z "$(env_get HUB_SECRET_KEY "$ENV_FILE")" ]]; then env_set HUB_SECRET_KEY "$(openssl rand -base64 32)" "$ENV_FILE"; NOVA_CHAVE=1; fi
# Na VPS a página de pareamento só escuta localmente (o código também aparece nos logs),
# e não há rede local para anunciar por mDNS.
env_set HTTP_HOST 127.0.0.1 "$ENV_FILE"
env_set MDNS false "$ENV_FILE"
ok "$ENV_FILE"
[[ $NOVA_CHAVE == 1 ]] && aviso "Gerei a HUB_SECRET_KEY. Guarde uma cópia do .env fora da VPS (sem ela, é preciso parear de novo)."

# 6. Subir ----------------------------------------------------------------------
passo 6/6 'Subindo o hub (o primeiro build leva alguns minutos)'
docker compose -f "$APP_DIR/apps/hub/docker-compose.yml" up -d --build
ok 'hub e go2rtc rodando'

cat <<EOF

Pronto. Próximos passos:
  1. Configure o roteador com o arquivo $ROTEADOR_CONF
       cat $ROTEADOR_CONF
     Teste daqui:  ping -c3 $WG_NET.2   e depois o IP de uma câmera.
  2. Veja o código de pareamento:
       docker compose -f $APP_DIR/apps/hub/docker-compose.yml logs -f hub
  3. No app: Ajustes › Parear hub. Depois Adicionar câmera › "Endereço IP ou URL RTSP"
     com o IP da câmera (a busca automática não passa pela VPN).
EOF
