# Hub Nuvigia

Serviço Node.js (TypeScript) que fica ligado 24h na rede de casa, num Raspberry Pi 4/5, mini PC ou NAS com Linux.
Ele conversa com as câmeras Wi‑Fi, grava, detecta movimento e (etapa 5) envia para Google Drive, OneDrive ou iCloud.
O app fala com o hub pelo Supabase Realtime, então **nenhuma porta é aberta no roteador**.

```
câmera ──RTSP──▶ go2rtc ──RTSP local──▶ ffmpeg (gravação e movimento)
                    └──WebRTC/HLS──▶ app (etapa 6)
hub ◀──Realtime (hub:<id>)──▶ Supabase ◀──▶ app
```

## O que ele faz

- **Identidade e pareamento.** Na primeira vez, chama a função `hub-register` e recebe um usuário próprio no Supabase (papel `hub`).
  Enquanto não tem dono, mostra um código de 6 dígitos e um QR no terminal e em `http://<ip-do-hub>:8787`. O código vale 10 minutos, é de uso único e é renovado sozinho.
- **Câmeras.** Procura câmeras ONVIF na rede (WS‑Discovery), conecta com usuário e senha da câmera, escolhe o perfil de vídeo pela qualidade dos Ajustes e registra o stream no go2rtc.
  Também aceita endereço RTSP manual. Verifica a cada 30 s se cada câmera responde e avisa o app quando ela cai ou volta.
- **Gravação.** ffmpeg sem recodificar o vídeo (pouco processador). Três jeitos: manual (botão Gravar), contínua (arquivos de 5 min) e por movimento (clipes de 30 s).
- **Movimento.** Compara quadros pequenos em tons de cinza (64×36, 2 por segundo) e também ouve os eventos de movimento ONVIF quando a câmera tem.
  Cada movimento vira um evento com miniatura (bucket `thumbnails`), que a etapa 7 usa para notificar.
- **Fotos.** O botão de foto pega a imagem atual pelo go2rtc e salva como gravação do tipo foto.
- **Nuvem.** Fila persistente de envio, um arquivo por vez, em partes e com retomada. Pastas `Nuvigia/{Câmera}/{AAAA-MM-DD}/`. O progresso aparece no app como "Enviando n%".
  Se der erro, tenta de novo em 1 min, 5 min, 15 min, 1 h e 3 h, e depois mostra a falha com o botão "Tentar de novo". Apaga da nuvem o que passou da retenção (30 dias por padrão) e atualiza a cota. Como configurar cada provedor: [docs/configurar-nuvem.md](../../docs/configurar-nuvem.md).
- **Disco.** Arquivos já enviados saem do hub depois de `LOCAL_KEEP_DAYS`. Sem nuvem, os arquivos ficam no hub até vencer a retenção dos Ajustes.
- **mDNS.** Anuncia `_nuvigia._tcp` na rede local.

## Segurança

- Usuário e senha das câmeras, a identidade do hub e (etapa 5) os tokens da nuvem ficam **só no hub**, num SQLite cifrado com AES‑256‑GCM.
  A chave vem de `HUB_SECRET_KEY`. O Supabase recebe apenas nome, cômodo, modelo, IP e status.
- O app só vê os dados do próprio hub (RLS por usuário). O hub só escreve linhas com o próprio `hub_id`.
- A API do go2rtc escuta apenas em `127.0.0.1`, e o `go2rtc.yaml` é montado como somente leitura para as URLs com senha não irem para o disco.
- A página local mostra só o código de uso único e o status.

## Instalar (Docker)

Pré‑requisitos: o projeto Supabase da etapa 3 criado ([supabase/README.md](../../supabase/README.md)) e Docker com Compose num Linux da rede de casa.

```bash
git clone https://github.com/Thiagolima1499/nuvigia-app.git && cd nuvigia-app
cp apps/hub/.env.example apps/hub/.env
openssl rand -base64 32        # cole em HUB_SECRET_KEY
# preencha SUPABASE_URL, SUPABASE_ANON_KEY e HUB_REGISTRATION_SECRET
docker compose -f apps/hub/docker-compose.yml up -d --build
docker compose -f apps/hub/docker-compose.yml logs -f hub   # mostra o QR
```

Depois, no app: **Ajustes › Parear hub**, leia o QR ou digite o código. Em seguida **Adicionar câmera**.

O Compose usa `network_mode: host`, que precisa de Linux (no Docker Desktop para Windows/Mac a descoberta de câmeras não funciona).
No Windows, rode sem Docker (abaixo) ou use uma máquina Linux na rede.

Guarde o `.env` (principalmente a `HUB_SECRET_KEY`) e o volume `nuvigia-data`. Sem eles o hub precisa ser registrado e pareado de novo, e as câmeras adicionadas de novo.

## Rodar sem Docker (desenvolvimento)

Precisa de Node 22.13+ e ffmpeg instalados, e do go2rtc rodando com o `go2rtc.yaml` desta pasta.

```bash
pnpm install
cp apps/hub/.env.example apps/hub/.env   # e preencha
cd apps/hub
node --env-file=.env --import tsx src/index.ts
```

## Ao vivo fora de casa

O app abre o vídeo por **WebRTC**. A oferta vai pelo canal do Supabase até o hub, que a entrega ao go2rtc. O vídeo segue direto entre o celular e o hub, sem abrir portas no roteador:

1. **STUN** (padrão): funciona na maioria das redes de casa e de celular.
2. **TURN**: para redes mais fechadas (algumas operadoras e redes corporativas). Suba um coturn numa VM com IP público usando [infra/coturn/turnserver.conf](../../infra/coturn/turnserver.conf) e configure no Supabase:
   ```bash
   supabase secrets set TURN_SECRET=<o mesmo static-auth-secret> \
     TURN_URLS="turn:turn.seu-dominio.com.br:3478?transport=udp,turns:turn.seu-dominio.com.br:5349?transport=tcp"
   supabase functions deploy turn-credentials
   ```
   A função `turn-credentials` entrega ao app uma senha de TURN que vale 1 hora.
3. **Plano B por HLS (opcional)**: se o hub tiver um endereço público por túnel (por exemplo, Cloudflare Tunnel apontando para `http://localhost:8787`), defina `HUB_PUBLIC_URL` no `.env`.
   Quando o WebRTC não conecta, o app toca o HLS por esse endereço. Com o túnel também dá para assistir no app as gravações que ainda estão no hub.
   Pelo túnel só passam links assinados que valem 15 minutos (`/hls/<token>/…` e `/files/<token>`). A página de pareamento e a API do go2rtc continuam só na rede de casa.

Sem túnel, as gravações abrem no site do Google Drive ou do OneDrive. No iCloud, elas ficam visíveis pelo CloudKit.

**Falar pela câmera**: o áudio do microfone vai na mesma sessão WebRTC e o go2rtc repassa para a câmera. Funciona em câmeras com alto-falante e áudio de retorno por ONVIF ou RTSP, como a maioria das Tapo e Imou.

## Desvincular

Quando o dono remove o hub no app, o hub percebe no próximo batimento (30 s), apaga a identidade e reinicia mostrando um novo código.

## Testes

```bash
pnpm --filter @nuvigia/hub test
```

Os testes usam processos e servidores falsos (ffmpeg, go2rtc, ONVIF, Supabase), então rodam sem câmera nem rede.

## Variáveis

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | — | Projeto Supabase |
| `HUB_REGISTRATION_SECRET` | — | Protege a função `hub-register` |
| `HUB_SECRET_KEY` | — | Chave AES‑256 do cofre local (32 bytes, base64 ou hex) |
| `HUB_NAME` | Hub Nuvigia | Nome mostrado no app |
| `DATA_DIR` | `./data` (`/data` no Docker) | Banco local e gravações |
| `GO2RTC_URL`, `GO2RTC_RTSP` | `127.0.0.1` | Onde está o go2rtc |
| `HTTP_PORT` | 8787 | Página de pareamento |
| `SEGMENT_SECONDS` | 300 | Tamanho dos arquivos no modo contínuo |
| `MOTION_CLIP_SECONDS` | 30 | Duração do clipe por movimento |
| `MOTION_SENSITIVITY` | 0.02 | Fração da imagem que precisa mudar |
| `MAX_MANUAL_SECONDS` | 3600 | Limite da gravação manual |
| `LOCAL_KEEP_DAYS` | 3 | Dias que um arquivo já enviado fica no hub |
| `MDNS` | true | Anunciar na rede local |
| `HUB_PUBLIC_URL` | — | Endereço do túnel (plano B por HLS e gravações pelo hub) |
| `CLOUDKIT_CONTAINER`, `CLOUDKIT_API_TOKEN`, `CLOUDKIT_ENV` | `iCloud.br.com.nuvigia`, —, development | iCloud (CloudKit Web Services) |
| `LOG_LEVEL` | info | Nível de log |
