# Prompt para o Claude Code

Cole o texto abaixo no Claude Code, com esta pasta (`design_handoff_nuvigia/`) dentro do repositório.

---

Você vai construir o **Nuvigia — Câmeras Wi-Fi**, um app mobile (iOS, Android, celulares e tablets) para conectar câmeras Wi-Fi da rede doméstica, assistir a elas ao vivo de qualquer lugar e gravar vídeos e fotos na nuvem do usuário, à escolha dele: **Google Drive, OneDrive ou iCloud Drive (Conta Apple)**. Responda e escreva textos da interface sempre em **português do Brasil**.

## Fontes de verdade
1. `design_handoff_nuvigia/README.md`: especificação completa de telas, medidas, cores, textos, estados e arquitetura. Leia inteiro antes de começar.
2. `design_handoff_nuvigia/prototipo/Nuvigia.html`: protótipo navegável. Abra no navegador para conferir comportamento.
3. `design_handoff_nuvigia/prototipo/App Cameras.dc.html`: fonte do protótipo. Use para extrair textos exatos e regras (classe `Component` no final do arquivo).
4. `design_handoff_nuvigia/tokens.css`: tokens do design system Organic.

O HTML é **referência visual**, não código para reaproveitar. Recrie a interface nativamente, com fidelidade alta: mesmas cores, fontes, raios, espaçamentos e textos.

## Stack
- Monorepo com pnpm workspaces:
  - `apps/mobile`: Expo (SDK atual) + React Native + TypeScript + Expo Router.
  - `apps/hub`: Node.js + TypeScript em Docker, rodando na rede de casa (Raspberry Pi ou mini PC).
  - `packages/shared`: tipos, contratos de mensagens e validação (zod).
  - `supabase/`: migrações SQL, políticas RLS e edge functions.
- Mobile: `react-native-webrtc` (ao vivo), `expo-video` (fallback HLS e reprodução), `expo-auth-session` (OAuth Google e Microsoft), `expo-apple-authentication` + CloudKit JS (login Apple/iCloud), `expo-notifications`, `react-native-safe-area-context`, `lucide-react-native` (strokeWidth 2.75), `@expo-google-fonts/caprasimo` e `@expo-google-fonts/figtree`, Zustand para estado local e TanStack Query para dados remotos.
- Hub: go2rtc (sidecar no docker-compose) para RTSP → WebRTC/HLS; ffmpeg para gravação segmentada e fotos; `onvif` (npm) para descoberta WS-Discovery, perfis RTSP e eventos de movimento; fallback de detecção de movimento por diferença de quadros em baixa resolução; camada `CloudProvider` com 3 implementações: `googleapis` (Drive v3, upload resumível), `@microsoft/microsoft-graph-client` (OneDrive, `createUploadSession`, pasta approot) e CloudKit Web Services (banco privado, `CKAsset`); fila persistente em SQLite com novas tentativas e backoff; anúncio mDNS `_nuvigia._tcp`.
- Nuvem: Supabase (Auth, Postgres, Realtime para comandos e eventos entre app e hub, Storage só para miniaturas temporárias) + coturn para TURN. Para o MVP, aceite Cloudflare Tunnel como alternativa ao TURN e deixe isso configurável.

## Segurança (obrigatório)
- Escopos mínimos: Google `drive.file`; Microsoft `Files.ReadWrite.AppFolder offline_access`; Apple: CloudKit apenas no banco privado do container `iCloud.br.com.nuvigia`. Tokens guardados criptografados no hub. O app só recebe status.
- Credenciais RTSP das câmeras ficam somente no hub, criptografadas (chave em variável de ambiente).
- RLS no Supabase: cada usuário acessa só os próprios hubs, câmeras, eventos e gravações.
- Pareamento app ↔ hub por código de uso único (QR ou 6 dígitos) com validade de 10 minutos.
- Nada de portas abertas no roteador do usuário.

## Ordem de execução (faça por etapas e confirme comigo ao final de cada uma)
1. **Base:** monorepo, lint, TypeScript estrito, tema com todos os tokens do README (`theme.ts`), fontes, componentes base (Button primário/secundário/fantasma/ícone, Tag, Segmented, Radio, Switch, Input em pílula, Card, BottomSheet/Dialog, Toast, TabBar flutuante). Faça uma tela de catálogo para eu revisar.
2. **Telas com dados simulados:** Câmeras (lista e grade), Ao vivo, Gravações, Ajustes, Adicionar câmera (3 passos com validação) e diálogo do Drive, exatamente como no README, com mocks iguais aos do protótipo. Responsivo: 1 coluna no celular; grades `auto-fill` e larguras máximas (1080/880/640/560) no tablet; safe areas; retrato e paisagem.
3. **Supabase:** esquema (`profiles`, `hubs`, `cameras`, `recordings`, `events`, `settings`, `pairing_codes`), RLS, login (e-mail mágico + Google), canais Realtime de comandos e eventos.
4. **Hub:** pareamento, descoberta ONVIF + cadastro manual por IP/URL RTSP, integração go2rtc, status online/offline, comandos `startRecording`/`stopRecording`/`snapshot`, gravação por movimento ou contínua conforme Ajustes, qualidade 720p/1080p/2K.
5. **Nuvem (Google Drive, OneDrive, iCloud):** interface `CloudProvider` (`connect`, `ensureFolder`, `uploadResumable`, `deleteOlderThan`, `getQuota`) com testes de contrato iguais para os 3. Implemente nesta ordem: Google Drive, OneDrive, iCloud. Login iniciado no app e tokens entregues ao hub. Estrutura `Nuvigia/{Câmera}/{AAAA-MM-DD}/`; progresso de upload publicado no Realtime (alimenta "Enviando n%"); retenção de 30 dias; cota exibida em Gravações. Para iCloud: siga a seção "Provedores de nuvem" do README (CloudKit Web Services + espelhamento no iCloud Drive pelo app iOS) e me avise de qualquer limitação encontrada antes de contorná-la.
6. **Ao vivo remoto:** sinalização WebRTC via Supabase Realtime, TURN, fallback HLS, áudio mudo/ligado e fala bidirecional (backchannel, quando a câmera suporta).
7. **Notificações:** push em movimento, com foto, respeitando a chave "Avisar quando houver movimento".
8. **Qualidade:** testes unitários (shared/hub), testes de componentes (mobile), e2e com Maestro do fluxo Adicionar câmera → Ao vivo → Gravar → Gravações; builds EAS de desenvolvimento para Android e iOS; README de instalação do hub (docker-compose + `.env.example`).

## Regras
- Textos da interface iguais aos do README e do protótipo.
- Nenhuma cor, fonte ou raio fora dos tokens.
- Estados de carregamento, vazio e erro para cada tela (câmera offline, Drive desconectado, falha de upload com "Tentar de novo", hub inacessível).
- Acessibilidade: alvos de 44px ou mais, rótulos de acessibilidade em todos os botões de ícone, contraste conforme o README.
- Antes de cada etapa, liste os arquivos que vai criar. Ao final, rode lint e testes e me mostre como testar no celular (Expo Go ou build de desenvolvimento).

Comece pela etapa 1.
