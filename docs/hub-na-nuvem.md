# Hub na nuvem (sem equipamento extra no local)

O hub roda numa VPS (um servidor Linux alugado) e conversa com as câmeras por uma VPN WireGuard que o próprio roteador da rede das câmeras abre.
No local ficam só o roteador e as câmeras.

```
câmeras ── rede das câmeras ── roteador ══ WireGuard ══▶ VPS (hub + go2rtc) ◀── Supabase ──▶ app
```

- O roteador **liga para a VPS**, então funciona mesmo atrás de CGNAT e sem abrir portas em casa.
- A VPS só enxerga a rede das câmeras. O resto da internet de casa não passa pela VPN.
- As câmeras não ficam expostas na internet.

## O que considerar antes

- **Upload da internet do local.** Cada câmera manda vídeo o tempo todo para a VPS, porque o hub grava e detecta movimento lá.
  Uma câmera em 1080p usa cerca de 2 Mbps, uns 650 GB de upload por mês. Some as câmeras e confira o plano de internet.
- **Busca automática.** A descoberta ONVIF não atravessa a VPN. As câmeras são adicionadas pelo IP no app (**Adicionar câmera › Endereço IP ou URL RTSP**).
- **Câmera com RTSP ou ONVIF.** Continua sendo obrigatório, igual ao hub em casa.

## 1. Rede das câmeras

1. No roteador, use uma faixa só para as câmeras (por exemplo `192.168.50.0/24`). Não pode ser `10.13.13.0/24`, que é a da VPN.
2. Reserve um IP fixo para cada câmera (reserva de DHCP pelo endereço MAC).
3. Opcional: bloqueie o acesso das câmeras à internet. O hub não precisa disso, mas o app do fabricante (Smart Life, por exemplo) deixa de funcionar.

## 2. VPS

Requisitos: Ubuntu 24.04 ou 22.04 (ou Debian 12), 2 vCPU e 2 GB de RAM para até 4 câmeras, 40 GB de disco e IP público.
Escolha a região de São Paulo para o ao vivo ter menos atraso. O tráfego que **entra** na VPS (o vídeo das câmeras) costuma ser gratuito; confira no provedor.

Opções: Oracle Cloud (plano grátis "Always Free" com máquina Ampere, quando há vaga na região), Hostinger, Magalu Cloud, AWS Lightsail, DigitalOcean.

No painel do provedor, libere na entrada: **22/tcp** (SSH), **51820/udp** (VPN) e **8555/tcp e udp** (ao vivo).

## 3. Instalar o hub na VPS

Entre por SSH e rode:

```bash
curl -fsSL https://raw.githubusercontent.com/Thiagolima1499/nuvigia-app/main/infra/vps/instalar-hub.sh -o instalar-hub.sh
sudo bash instalar-hub.sh
```

O script pergunta a faixa da rede das câmeras, a `SUPABASE_URL`, a `SUPABASE_ANON_KEY` e o `HUB_REGISTRATION_SECRET`. Depois ele:

- instala WireGuard, Docker e firewall (ufw);
- cria a VPN e gera a configuração do roteador em `/root/nuvigia-roteador.conf`;
- baixa o projeto em `/opt/nuvigia-app`, preenche `apps/hub/.env` (gera a `HUB_SECRET_KEY`) e sobe o hub com Docker.

Guarde uma cópia do `apps/hub/.env` fora da VPS. Para atualizar o hub depois, rode o mesmo comando de novo.

## 4. Configurar o roteador

Veja a configuração com `sudo cat /root/nuvigia-roteador.conf`. Ela tem a chave privada do roteador, o endereço `10.13.13.2/24` e a VPS como par, com `AllowedIPs = 10.13.13.1/32` (só o tráfego da VPS entra na VPN).

O roteador precisa ser **cliente WireGuard** e **deixar a VPN acessar a rede das câmeras**.

**GL.iNet**: em VPN › WireGuard Client, adicione a configuração (dá para colar ou subir o arquivo), ligue a conexão e ative a opção de permitir acesso remoto à LAN.

**MikroTik (RouterOS 7)**, no terminal, trocando os valores entre `<>` pelos do arquivo:

```
/interface wireguard add name=wg-nuvigia private-key="<PrivateKey>"
/interface wireguard peers add interface=wg-nuvigia public-key="<PublicKey da VPS>" endpoint-address=<IP da VPS> endpoint-port=51820 allowed-address=10.13.13.1/32 persistent-keepalive=25s
/ip address add address=10.13.13.2/24 interface=wg-nuvigia
/ip firewall filter add chain=forward in-interface=wg-nuvigia action=accept place-before=0 comment="Nuvigia: VPS -> cameras"
```

**Outros (TP-Link Omada, Asus, OpenWrt, pfSense…)**: crie um cliente WireGuard com os mesmos campos e libere o tráfego da interface WireGuard para a rede das câmeras.

Teste na VPS:

```bash
ping -c3 10.13.13.2          # o roteador
ping -c3 192.168.50.20       # uma câmera (use o IP dela)
sudo wg show                 # "latest handshake" recente = VPN no ar
```

## 5. Parear e adicionar as câmeras

1. Veja o código: `docker compose -f /opt/nuvigia-app/apps/hub/docker-compose.yml logs -f hub`.
   Na VPS, a página de pareamento (porta 8787) fica fechada para a internet; o código aparece nos logs.
2. No app: **Ajustes › Parear hub** e digite o código.
3. **Adicionar câmera › Endereço IP ou URL RTSP**: digite o IP da câmera (ONVIF) ou a URL RTSP completa, com usuário e senha da câmera.

## Problemas comuns

| Sintoma | O que ver |
| --- | --- |
| `wg show` sem handshake | Porta 51820/udp fechada no painel do provedor, ou IP da VPS errado no roteador. |
| Handshake ok, mas a câmera não responde ao ping | O roteador não libera o tráfego da VPN para a rede das câmeras, ou a faixa informada no script está errada (corrija em `/etc/nuvigia-vps.env` e rode o script de novo). |
| Ao vivo não abre | Porta 8555 fechada no painel do provedor. |
| Vídeo travando | Upload da internet do local no limite. Use a qualidade "Média" nos Ajustes ou menos câmeras. |
