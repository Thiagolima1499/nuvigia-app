# Handoff: Nuvigia — Câmeras Wi-Fi

## Visão geral
Nuvigia é um app mobile (celular e tablet, iOS e Android) para:
1. **Conectar câmeras Wi-Fi** da rede doméstica (descoberta automática + cadastro manual por IP/QR).
2. **Assistir às câmeras ao vivo, remotamente**, de qualquer lugar (fora da rede de casa).
3. **Gravar vídeos e fotos na nuvem do usuário, à escolha: Google Drive, OneDrive ou iCloud Drive (Conta Apple)**, manualmente ou por detecção de movimento, com retenção configurável. Um provedor ativo por vez.

## Sobre os arquivos de design
Os arquivos deste pacote são **referências de design feitas em HTML**: protótipos que mostram aparência e comportamento esperados. **Não são código de produção para copiar.** A tarefa é **recriar esses designs em um app real**, usando o framework escolhido (recomendação abaixo) e seus padrões e bibliotecas.

- `prototipo/Nuvigia.html` — protótipo autocontido. Abra em qualquer navegador (ou no celular) e clique por todo o fluxo.
- `prototipo/App Cameras.dc.html` — código-fonte do protótipo (template + classe de lógica no final do arquivo). Útil para ler textos exatos, estados e regras. Depende da pasta `_ds/` do projeto de design para os estilos; o arquivo `tokens.css` deste pacote contém todos os tokens necessários.

## Fidelidade
**Alta fidelidade (hi-fi).** Cores, tipografia, espaçamentos, raios, textos e interações são finais. Recrie a interface fielmente. As imagens das câmeras são placeholders escuros: no app real, entram os streams de vídeo.

## Stack recomendada (se não houver código existente)
- **App:** React Native + Expo (TypeScript), Expo Router, um único código para iOS, Android e tablets.
- **Vídeo ao vivo:** WebRTC (`react-native-webrtc`) com fallback HLS (`expo-video`).
- **Hub local (obrigatório):** serviço em Docker rodando 24h na rede de casa (Raspberry Pi 4/5, mini PC ou NAS). O celular não consegue gravar continuamente nem ficar acessível de fora; o hub faz isso:
  - **go2rtc** para ler RTSP/ONVIF das câmeras e servir WebRTC/HLS;
  - **ffmpeg** para gravar segmentos MP4 e capturar fotos;
  - detecção de movimento (eventos ONVIF quando a câmera suporta; senão, diferença de quadros com OpenCV em baixa resolução);
  - upload para o provedor escolhido (ver "Provedores de nuvem"), com fila persistente e novas tentativas.
- **Acesso remoto:** WebRTC com servidor de sinalização + TURN (coturn) na nuvem. Alternativa mais simples para o MVP: Cloudflare Tunnel ou Tailscale no hub.
- **Backend na nuvem:** Supabase (Auth, Postgres, Realtime) para contas, cadastro de hubs e câmeras, eventos e sinalização. Push via Expo Notifications (FCM/APNs).
- **Provedores de nuvem:** interface única `CloudProvider` no hub (`connect`, `ensureFolder`, `uploadResumable`, `deleteOlderThan`, `getQuota`), com 3 implementações:
  - **Google Drive:** API v3, OAuth 2.0 com escopo `drive.file` (só arquivos criados pelo app), upload resumível, cota via `about.get(storageQuota)`. Pasta `Meu Drive/Nuvigia`.
  - **OneDrive:** Microsoft Graph, OAuth 2.0 (MSAL) com escopos `Files.ReadWrite.AppFolder offline_access`, pasta do app `/drive/special/approot` (aparece como `OneDrive/Aplicativos/Nuvigia`), upload por `createUploadSession` em blocos de 10 MiB, cota via `/me/drive` (`quota`). Contas pessoais e corporativas.
  - **iCloud (Conta Apple):** a Apple não oferece API pública de iCloud Drive para servidores. Usar **CloudKit Web Services** no banco **privado** do container `iCloud.br.com.nuvigia`: o usuário faz login com Conta Apple, o hub guarda o `ckWebAuthToken` e envia cada clipe como registro `Clip` com campo `CKAsset` (conta na cota do iCloud do usuário). No iOS, o app espelha os clipes para a pasta `iCloud Drive/Nuvigia` (container ubíquo, `NSUbiquitousContainers`) para aparecerem no app Arquivos. No Android, o iCloud funciona pelo mesmo login web, mas sem o espelhamento no Arquivos. A cota exibida vem do CloudKit quando disponível; senão, mostrar só o espaço usado pelo Nuvigia.
  - Tokens (refresh tokens / ckWebAuthToken) ficam no hub, criptografados; nunca no app. Trocar de provedor não move gravações antigas (perguntar ao usuário se quer migrar; fora do MVP).

## Arquitetura
```
[Câmeras Wi-Fi] --RTSP/ONVIF--> [Hub Nuvigia (casa)] --upload--> [Google Drive | OneDrive | iCloud]
                                     |  ^
                     WebRTC / túnel  |  | comandos (gravar, foto, ajustes)
                                     v  |
[App Nuvigia] <--Auth/Realtime/Push--> [Backend nuvem (Supabase + TURN)]
```
Pareamento do hub: o app encontra o hub na rede local via mDNS (`_nuvigia._tcp`) ou lê um QR code exibido pelo hub, e o vincula à conta do usuário.

## Telas
O app ocupa a tela inteira e respeita as safe areas (`env(safe-area-inset-*)`). Fundo `--color-bg` em todas as telas. Margem lateral: `max(17.6px, (largura − máx)/2)`, ou seja, o conteúdo fica centralizado e limitado a uma largura máxima em tablets.

### Barra de abas (Câmeras, Gravações, Ajustes)
- Flutuante, centralizada; largura `min(100% − 32px, 480px)`; altura 66px; distância da base `safe-area + 16px`; padding 6px; `border-radius: 999px`; fundo `#2e2b25`; `--shadow-lg`.
- 3 colunas iguais. Item: ícone Lucide 19px (traço 2.75) + rótulo Figtree 13px/600. Ativo: fundo `#c67139`, texto `#f5ead8`, pílula. Inativo: transparente, texto `#dcd3c4`.
- Visível apenas em Câmeras, Gravações e Ajustes. Escondida em Ao vivo e no fluxo Adicionar câmera.
- Ícones: `video` (Câmeras), `cloud-upload` (Gravações), `sliders-horizontal` (Ajustes).

### 1. Câmeras (início)
Largura máx. do conteúdo: 1080px. Padding inferior `safe-area + 110px` (espaço da barra de abas).
- **Cabeçalho** (flex, espaço entre):
  - Marca: "Nuvigia" (Caprasimo 17px, `#8c491a`) + "Câmeras Wi-Fi" (Figtree 12px, `#645c50`), gap 8px.
  - Saudação dinâmica (Figtree 13px, `#645c50`, margem superior 6px): "Bom dia" (<12h), "Boa tarde" (<18h), "Boa noite".
  - Título "Minhas câmeras": Caprasimo 32px, line-height 1.05.
  - Botão "+" circular 48×48, `.btn-primary` (fundo `#c67139`; hover `#b2622d`; pressionado `#8c491a`), ícone `plus` 22px. Abre Adicionar câmera.
- **Faixa da nuvem conectada** (margem superior 17.6px): botão em pílula, largura total, padding 12×16, fundo `#e1eecc` (hover `#ccdbb2`). Círculo 34px `#728157` com ícone `cloud-upload` 18px em `#f5ead8`. Título "Salvando no {Provedor}" (14px/600, `#272e1b`); subtítulo "{N} gravando agora · {usado} de {total}" (12px, `#3d472b`); chevron à direita. Toque leva a Gravações.
- **Cartão sem nuvem** (substitui a faixa): raio 28px, padding 17.6px, fundo `#ffe1d0`. Título "Escolha onde salvar" (Caprasimo 19px, `#402310`); texto "Conecte Google Drive, OneDrive ou iCloud. Sem a nuvem, as gravações ficam só no cartão de memória das câmeras." (13px/1.45, `#402310`); botão primário pílula "Conectar nuvem", que abre o diálogo de escolha.
- **Grade de câmeras** (margem superior 26.4px, gap 13.2px):
  - Modo lista (padrão): `repeat(auto-fill, minmax(min(100%, 320px), 1fr))`, prévia 16:10. Fica com 1 coluna no celular e 2 a 3 no tablet.
  - Modo grade: `minmax(min(100%, 170px), 1fr)`, prévia 1:1.
  - Cartão: prévia com raio 28px, fundo `#474238` e brilho radial `#645c50` a 70%/30%. Selo "AO VIVO" (11px/600, tracking .04em, fundo `#2e2b25` a 70%, texto `#f9f4ed`, pílula 3×9). Selo "REC" quando gravando: fundo `#c67139`, ponto 7px pulsando (opacidade 1→.25→1, 1,4s, infinito). Relógio ao vivo HH:MM:SS no canto inferior esquerdo (11px, números tabulares, `#eee7db`).
  - Abaixo da prévia: nome (15px/600) à esquerda e modo à direita ("Por movimento", "Contínua" ou "Offline"; 12px, `#645c50`).
  - Câmera offline: prévia em `#dcd3c4`, ícone `wifi-off` 24px + "Sem conexão" (13px, `#645c50`). Ao tocar, mostra o aviso "{Nome} está sem conexão".

### 2. Ao vivo
Largura máx. 880px.
- Cabeçalho: botão voltar circular 44px (fundo `#ebddc5`, hover `#dcd3c4`, ícone `chevron-left`); nome da câmera (Caprasimo 22px) e "{Cômodo} · Wi‑Fi forte" (12px, `#645c50`).
- Vídeo: largura 100%, altura `min(62vh, 125vw)`, mínimo 220px, raio 28px. Selos: "AO VIVO · 1080p" e, se gravando, selo laranja com ponto pulsando + cronômetro MM:SS. "Áudio mudo" no canto superior direito quando o áudio está desligado. Carimbo "DD/MM HH:MM:SS" no canto inferior esquerdo.
- Botão principal (altura 58px, pílula, Caprasimo 17px):
  - Sem gravar: fundo `#c67139`, texto `#f5ead8`, ícone círculo 18px, "Gravar no {Provedor}".
  - Gravando: fundo `#2e2b25`, texto `#f9f4ed`, ícone quadrado 18px raio 4, "Parar e salvar na nuvem". Ao parar, mostra o aviso "Gravação enviada ao {Provedor}".
  - Se não houver nuvem conectada, abre o diálogo de escolha.
- 3 ações (grade de 3 colunas, gap 13.2px; cada uma com raio 28px, padding 14px, ícone 22px + rótulo 12px, fundo `#ebddc5`):
  - **Foto** (`camera`): salva a foto na nuvem, aviso "Foto salva no {Provedor}".
  - **Áudio/Mudo** (`mic`): alterna; quando mudo, fundo `#ffe1d0` e rótulo "Mudo".
  - **Falar/Falando…** (`volume-2`): áudio bidirecional; ativo com fundo `#ccdbb2`.
- "Hoje" (Caprasimo 19px) e lista de eventos: linhas com raio 16px, fundo `#ebddc5`, padding 10×14. Hora (13px/600, tabular, 42px), descrição (14px) e tag `.tag-accent-2` ("Gravado" / "Sistema").

### 3. Gravações
Largura máx. 1080px.
- Título "Gravações" (Caprasimo 32px).
- Cartão de armazenamento (raio 28px, fundo `#e1eecc`): "{Provedor}" (600, `#272e1b`) e "{usado} de {total}" (13px, `#3d472b`). Barra de 10px com a % usada (trilho `#f0fae1`, preenchimento `#728157`, pílula). "Pasta: {caminho}" (12px): "Meu Drive › Nuvigia", "OneDrive › Aplicativos › Nuvigia" ou "iCloud Drive › Nuvigia".
- Filtro segmentado `.seg`: Todas / {câmeras}. Rola na horizontal se não couber.
- Lista em grade `auto-fill minmax(min(100%, 320px), 1fr)`, gap 13.2px. Item: raio 28px, fundo `#ebddc5`, padding 10px. Miniatura 78×58 raio 16px `#474238` com ícone play. Nome (14px/600), "{quando} · {duração}" (12px), tag de status.
  - Enviando: tag `.tag-accent` "Enviando {n}%" + barra de 6px `#c67139` sobre `#dcd3c4`.
  - Concluído: tag `.tag-accent-2` "No Drive" / "No OneDrive" / "No iCloud".
  - Toque na gravação: abrir o player (tela não desenhada; use o padrão da tela Ao vivo).

### 4. Ajustes
Largura máx. 640px. Gap vertical 17.6px.
- **Onde salvar as gravações** (rótulo 13px/600, `#645c50`): lista em cartão (raio 28px, fundo `#ebddc5`) com 3 linhas (padding 14×16):
  - Círculo 40px com inicial (Caprasimo 17px): Google Drive "G" (`#ccdbb2`/`#272e1b`), OneDrive "O" (`#ffc6a5`/`#402310`), iCloud Drive "A" (`#dcd3c4`/`#2e2b25`). Substituir pelas marcas oficiais seguindo as diretrizes de cada empresa.
  - Nome (14px/600) e subtítulo (12px): a conta conectada ("voce@gmail.com", "voce@outlook.com", "Conta Apple · voce@icloud.com") ou "Não conectado".
  - Linha ativa: fundo `#e1eecc` + tag "Conectado". Tocar em outra linha abre o diálogo com aquele provedor pré-selecionado.
  - Abaixo, quando há nuvem conectada: botão secundário pílula "Desconectar {Provedor}".
- **Qualidade da gravação** (rótulo 13px/600, `#645c50`): segmentado 720p / 1080p / 2K. Dica abaixo: "Cerca de 0,4 / 0,9 / 1,8 GB por hora de vídeo".
- **Quando gravar**: rádios `.radio`: "Só quando houver movimento" (padrão) / "O tempo todo".
- Lista de chaves (cartão raio 28px, linhas 14×16, hover `#dcd3c4`). Interruptor: 48×28, ligado `#728157`, desligado `#c0b6a5`, botão 22px `#f9f4ed` com `--shadow-sm`, transição de 0,2s.
  - "Enviar só no Wi‑Fi": "Não usa seus dados móveis" (ligado)
  - "Avisar quando houver movimento": "Notificação com foto da câmera" (ligado)
  - "Apagar da nuvem após 30 dias": "Libera espaço automaticamente" (ligado)

### 5. Adicionar câmera (3 passos, tela cheia por cima das abas)
Largura máx. 560px. Topo: "Passo X de 3" (13px, `#645c50`) e botão fechar circular 44px (`x`).
- **Passo 1, Procurar:** título "Procurando câmeras na sua rede" (Caprasimo 30px/1.1). Texto "Ligue a câmera e deixe o celular conectado ao Wi‑Fi **{SSID}**." Pílula de status `#fff2eb` com spinner de 20px (borda 3px `#ffc6a5`, topo `#c67139`, 1s linear) e texto `#643312`: "Buscando no Wi‑Fi…" e depois "{n} câmeras encontradas, buscando mais…". Os dispositivos aparecem conforme são descobertos: raio 28px, fundo `#ebddc5`, círculo 42px `#e1eecc` com ícone `video`, modelo (14px/600) + IP (12px), chevron. Link fantasma "Adicionar por IP ou QR code".
- **Passo 2, Configurar:** título "Configurar {modelo}". Campos em pílula com altura 48px e padding 0 18px: "Nome da câmera", "Cômodo", "Senha do Wi‑Fi {SSID}" (tipo senha). Validação: senha com 8 caracteres ou mais; senão, mensagem "A senha precisa ter ao menos 8 caracteres." (12px, `#8c491a`). Chave "Gravar na nuvem": "Clipes de movimento enviados automaticamente" (ligada). Botão primário em bloco "Conectar câmera" (altura 54px, 16px) preso ao fim da tela.
  - No app real, pedir também usuário e senha RTSP/ONVIF da câmera quando necessário.
- **Passo 3, Conectando:** título "Conectando…", depois "{Nome} pronta". 3 linhas em pílula que ficam verdes conforme o progresso (pendente: `#ebddc5`/`#c0b6a5`; concluído: `#e1eecc`, círculo `#728157` com check, texto `#272e1b`): "Câmera encontrada", "Conectando ao Wi‑Fi {SSID}", "Vinculando ao {Provedor}" (ou "Preparando transmissão" se a chave estiver desligada). Ao terminar, botão "Ver ao vivo" adiciona a câmera à lista e abre Ao vivo.

### Diálogo "Onde salvar as gravações?"
Fundo `#2e2b25` a 50%; folha presa à base (centralizada, `min(460px, 100%)`, raio 36px, `.dialog`). Título "Onde salvar as gravações?". 3 opções `.radio` em pílula (padding 12×16; selecionada `#fff2eb`, demais `#f9f4ed`): nome (600) + nota à direita (12px): "Google Drive · 15 GB grátis", "OneDrive · 5 GB grátis", "iCloud Drive · 5 GB grátis". Texto: "O Nuvigia vai criar a pasta “Nuvigia” no {Provedor} e salvar nela apenas vídeos e fotos das suas câmeras." (para iCloud, antes: "Você vai entrar com sua Conta Apple. "). Botões: "Agora não" (secundário) e o primário conforme a escolha: "Entrar com Google" / "Entrar com Microsoft" / "Entrar com Apple". O primário abre o OAuth correspondente; em caso de sucesso, mostra o aviso "{Provedor} conectado".

### Aviso (toast)
Centralizado, `min(100% − 48px, 420px)`, a `safe-area + 100px` da base, pílula, fundo `#2e2b25`, texto `#f9f4ed` 14px, ícone check `#aebf92`, `--shadow-lg`. Some após 2,2s.

## Interações e comportamento
- Navegação: abas (Câmeras/Gravações/Ajustes), pilha para Ao vivo, modal em tela cheia para Adicionar câmera, folha inferior para o diálogo.
- Relógio e cronômetro de gravação atualizam a cada 1s.
- Estados de hover e pressionado vêm das rampas (ver tokens). Foco do teclado: `outline: 2px solid #c67139; outline-offset: 2px`.
- Alvos de toque com no mínimo 44px.
- Responsivo: celular em 1 coluna; tablet com grades `auto-fill` e conteúdo centralizado nas larguras máximas indicadas. Suporte a retrato e paisagem.

## Estado e dados
```ts
type Camera = { id: string; hubId: string; name: string; room: string; model: string; ip: string;
  rtspUrl: string; online: boolean; recording: boolean; recStartedAt?: string;
  recordMode: 'motion' | 'continuous'; uploadToDrive: boolean };
type Recording = { id: string; cameraId: string; startedAt: string; durationSec: number;
  kind: 'video' | 'photo'; driveFileId?: string; uploadProgress: number; // 0–100
  status: 'recording' | 'uploading' | 'done' | 'failed' };
type CameraEvent = { id: string; cameraId: string; at: string; type: 'motion' | 'person' | 'reconnected'; recordingId?: string };
type Settings = { quality: '720p' | '1080p' | '2K'; recordMode: 'motion' | 'continuous';
  wifiOnly: boolean; notifyMotion: boolean; retentionDays: number | null };
type CloudProviderId = 'google' | 'onedrive' | 'icloud';
type CloudStatus = { provider: CloudProviderId | null; connected: boolean; account?: string; usedBytes: number; totalBytes?: number; folderRef?: string };
```
- Comandos do app para o hub: `startRecording(cameraId)`, `stopRecording(cameraId)`, `snapshot(cameraId)`, `setMute`, `startTalk`, `updateSettings`, `discoverCameras()`, `addCamera(...)`.
- Eventos do hub para o app (Realtime): status online/offline, início e fim de gravação, progresso de upload, eventos de movimento.
- Nuvem: em qualquer provedor, estrutura `Nuvigia/{Câmera}/{AAAA-MM-DD}/` e arquivo `{camera}_{AAAAMMDD-HHMMSS}.mp4|.jpg` (no CloudKit, campos `camera`, `date`, `startedAt` no registro `Clip`). Retenção: o hub apaga da nuvem os arquivos com mais de N dias. `Recording.driveFileId` passa a ser `cloudFileRef` (+ `provider`).

## Tokens de design (Organic)
Fontes: **Caprasimo** 400 (títulos) e **Figtree** (texto), ambas no Google Fonts. Ícones: **Lucide**, traço **2.75**.

Cores:
- Fundo `#f5ead8` · Superfície `#ebddc5` · Texto `#201e1d` · Destaque `#c67139` · Destaque 2 (sálvia) `#7a8a5e`
- Neutros 100–900: `#f9f4ed #eee7db #dcd3c4 #c0b6a5 #a19786 #82796a #645c50 #474238 #2e2b25`
- Destaque 100–900: `#fff2eb #ffe1d0 #ffc6a5 #f6a06b #d67f48 #b2622d #8c491a #643312 #402310`
- Sálvia 100–900: `#f0fae1 #e1eecc #ccdbb2 #aebf92 #8fa073 #728157 #56633f #3d472b #272e1b`
- Texto em laranja no tamanho de parágrafo deve usar `#8c491a` (contraste).

Espaçamento: 4.4 · 8.8 · 13.2 · 17.6 · 26.4 · 35.2 px.
Raios: 8 · 16 · 28 px; botões, campos e pílulas com 999px.
Sombras: sm `0 1px 2px rgba(46,43,37,.14)` · md `0 3px 10px rgba(46,43,37,.16)` · lg `0 12px 32px rgba(46,43,37,.22)`.
Escala de tipo usada: 32 / 30 / 22 / 19 / 17 (Caprasimo) e 16 / 15 / 14 / 13 / 12 / 11 (Figtree).
Componentes de referência: veja `tokens.css` (`.btn`, `.tag`, `.seg`, `.radio`, `.input`, `.card`, `.dialog`).

## Assets
- Ícones: Lucide (`video`, `plus`, `cloud-upload`, `chevron-left`, `chevron-right`, `camera`, `mic`, `volume-2`, `wifi-off`, `x`, `check`, `play`, `sliders-horizontal`).
- Ícone do app: não desenhado. Placeholder: círculo creme sobre laranja `#c67139`.
- Não há fotografias: as prévias de câmera são o próprio vídeo.

## Arquivos
- `prototipo/Nuvigia.html` — protótipo navegável autocontido.
- `prototipo/App Cameras.dc.html` — fonte do protótipo (lógica e textos).
- `tokens.css` — folha de estilos do design system Organic (tokens e componentes).
- `PROMPT_CLAUDE_CODE.md` — prompt completo para iniciar a implementação no Claude Code.
