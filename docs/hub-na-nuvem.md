# Hub na nuvem (sem equipamento extra no local)

O hub roda numa VPS (um servidor Linux alugado) e conversa com as câmeras por uma VPN WireGuard entre a VPS e o roteador da rede das câmeras.
No local ficam só o roteador e as câmeras.

```
câmeras ── rede das câmeras ── roteador ══ WireGuard ══▶ VPS (hub + go2rtc) ◀── Supabase ──▶ app
```

Há dois jeitos, conforme o roteador:

- **Roteador servidor WireGuard** (TP-Link Deco, Asus e outros): a VPS liga para o roteador. Precisa de IP público em casa (sem CGNAT).
- **Roteador cliente WireGuard** (GL.iNet, MikroTik, OpenWrt): o roteador liga para a VPS. Funciona até atrás de CGNAT.

Nos dois casos:
- A VPS só enxerga a rede das câmeras (no Deco, que não separa redes, é a rede da casa toda). O resto da internet de casa não passa pela VPN.
- As câmeras não ficam expostas na internet.

## O que considerar antes

- **Upload da internet do local.** Cada câmera manda vídeo o tempo todo para a VPS, porque o hub grava e detecta movimento lá.
  Uma câmera em 1080p usa cerca de 2 Mbps, uns 650 GB de upload por mês. Some as câmeras e confira o plano de internet.
- **Busca automática.** A descoberta ONVIF não atravessa a VPN. As câmeras são adicionadas pelo IP no app (**Adicionar câmera › Endereço IP ou URL RTSP**).
- **Câmera com RTSP ou ONVIF.** Continua sendo obrigatório, igual ao hub em casa.

## 1. Rede das câmeras

1. Anote a faixa de IPs da rede das câmeras. No Deco, o padrão é `192.168.68.0/22`. Se o roteador permitir, use uma faixa só para as câmeras. Não pode ser `10.13.13.0/24`, que é a da VPN.
2. Reserve um IP fixo para cada câmera (reserva de DHCP pelo endereço MAC).
3. Opcional: bloqueie o acesso das câmeras à internet. O hub não precisa disso, mas o app do fabricante (Smart Life, por exemplo) deixa de funcionar.

## 2. VPS

Requisitos: Ubuntu 24.04 ou 22.04 (ou Debian 12), 2 vCPU e 2 GB de RAM para até 4 câmeras, 40 GB de disco e IP público.
Escolha a região de São Paulo para o ao vivo ter menos atraso. O tráfego que **entra** na VPS (o vídeo das câmeras) costuma ser gratuito; confira no provedor.

Opções: Oracle Cloud (plano grátis "Always Free" com máquina Ampere, quando há vaga na região), Hostinger, Magalu Cloud, AWS Lightsail, DigitalOcean.

No painel do provedor, libere na entrada: **22/tcp** (SSH) e **8555/tcp e udp** (ao vivo). Com roteador cliente WireGuard, libere também **51820/udp**.

## 3. Roteador servidor WireGuard (Deco)

Pule para o passo 4 se o roteador for cliente WireGuard.

1. **Confira se não há CGNAT.** No app Deco, veja o IP da internet (WAN) e compare com o IP que aparece em https://meuip.com.br, com o celular no Wi‑Fi do Deco.
   Se forem diferentes (ou o do Deco começar com `100.`), a operadora usa CGNAT e a VPS não consegue chegar em casa. Peça à operadora um "IP público" ou "IP válido"; muitas liberam sem custo.
   O Deco precisa estar no **modo roteador** (se houver um modem da operadora na frente, ele deve estar em modo bridge).
2. **Atualize o firmware** do Deco pelo app. O servidor WireGuard veio em versões recentes do X50.
3. **Endereço fixo:** no app, em Mais › Avançado › DDNS, ative o TP-Link DDNS e anote o nome (algo como `minhacasa.tplinkdns.com`).
4. **Crie o cliente:** em Mais › Avançado › Servidor VPN › WireGuard, ative o servidor, crie uma conta para a VPS e escolha acesso **só à rede de casa**. Exporte ou copie a configuração dessa conta.
5. Na configuração, troque o IP do `Endpoint` pelo nome do DDNS (mantenha a porta). As outras linhas ficam como estão; o script ajusta o `AllowedIPs` para só a rede das câmeras passar pela VPN.
6. Na VPS, salve o conteúdo em `/root/roteador-wireguard.conf` (por exemplo com `sudo nano /root/roteador-wireguard.conf`). Com esse arquivo presente, o script usa este modo.

Os nomes dos menus podem variar um pouco conforme a versão do app.

## 4. Instalar o hub na VPS

Entre por SSH e rode:

```bash
curl -fsSL https://raw.githubusercontent.com/Thiagolima1499/nuvigia-app/main/infra/vps/instalar-hub.sh -o instalar-hub.sh
sudo bash instalar-hub.sh
```

O script pergunta a faixa da rede das câmeras, a `SUPABASE_URL`, a `SUPABASE_ANON_KEY` e o `HUB_REGISTRATION_SECRET`. Depois ele:

- instala WireGuard, Docker e firewall (ufw);
- monta a VPN: com `/root/roteador-wireguard.conf`, liga a VPS ao Deco (e resolve o DDNS de novo a cada 5 min); sem ele, cria o servidor na VPS e gera a configuração do roteador em `/root/nuvigia-roteador.conf`;
- baixa o projeto em `/opt/nuvigia-app`, preenche `apps/hub/.env` (gera a `HUB_SECRET_KEY`) e sobe o hub com Docker.

Guarde uma cópia do `apps/hub/.env` fora da VPS. Para atualizar o hub depois, rode o mesmo comando de novo.

## 5. Roteador cliente WireGuard (GL.iNet, MikroTik…)

Pule este passo no Deco. Veja a configuração com `sudo cat /root/nuvigia-roteador.conf`. Ela tem a chave privada do roteador, o endereço `10.13.13.2/24` e a VPS como par, com `AllowedIPs = 10.13.13.1/32` (só o tráfego da VPS entra na VPN).

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

## 6. Testar a VPN

Na VPS:

```bash
sudo wg show                 # "latest handshake" recente = VPN no ar
ping -c3 192.168.68.20       # uma câmera (use o IP dela)
```

## 7. Parear e adicionar as câmeras

1. Veja o código: `docker compose -f /opt/nuvigia-app/apps/hub/docker-compose.yml logs -f hub`.
   Na VPS, a página de pareamento (porta 8787) fica fechada para a internet; o código aparece nos logs.
2. No app: **Ajustes › Parear hub** e digite o código.
3. **Adicionar câmera › Endereço IP ou URL RTSP**: digite o IP da câmera (ONVIF) ou a URL RTSP completa, com usuário e senha da câmera.

## Problemas comuns

| Sintoma | O que ver |
| --- | --- |
| `wg show` sem handshake (Deco) | CGNAT na operadora, Deco fora do modo roteador, nome do DDNS errado no `Endpoint` ou servidor VPN desligado no app. |
| `wg show` sem handshake (roteador cliente) | Porta 51820/udp fechada no painel do provedor, ou IP da VPS errado no roteador. |
| Handshake ok, mas a câmera não responde ao ping | O roteador não libera o tráfego da VPN para a rede das câmeras, ou a faixa informada no script está errada (corrija em `/etc/nuvigia-vps.env` e rode o script de novo). |
| Ao vivo não abre | Porta 8555 fechada no painel do provedor. |
| Vídeo travando | Upload da internet do local no limite. Use a qualidade "Média" nos Ajustes ou menos câmeras. |
