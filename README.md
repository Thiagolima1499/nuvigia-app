# Nuvigia — Câmeras Wi-Fi

App mobile (iOS, Android, celulares e tablets) para conectar câmeras Wi-Fi da rede de casa, assistir ao vivo de qualquer lugar e gravar vídeos e fotos na nuvem do usuário: Google Drive, OneDrive ou iCloud Drive.

A especificação completa (telas, textos, tokens e arquitetura) está em [`design_handoff_nuvigia/`](design_handoff_nuvigia/README.md).

## Estrutura

| Pasta | O que é |
| --- | --- |
| `apps/mobile` | App Expo + React Native + TypeScript + Expo Router |
| `apps/hub` | Hub em Docker na rede de casa (etapa 4) |
| `packages/shared` | Tipos, contratos de mensagens app ↔ hub e validação (zod) |
| `supabase` | Esquema, RLS e edge functions (etapa 3) |
| `design_handoff_nuvigia` | Hand-off do Claude Design (referência visual, não é código de produção) |

## Como rodar o app

Pré-requisitos: Node.js 20 ou mais novo e pnpm 10 (`npm i -g pnpm` ou `corepack enable`).

```bash
pnpm install
pnpm mobile          # abre o Expo; leia o QR code com o app Expo Go no celular
```

No navegador: `pnpm --filter @nuvigia/mobile web`.

O app abre no **catálogo de componentes** (etapa 1). A partir da etapa 2 ele passa a abrir na tela Câmeras.

## Verificações

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Etapas

1. **Base:** monorepo, lint, TypeScript estrito, tema com os tokens, fontes, componentes base e catálogo. ← atual
2. Telas com dados simulados (Câmeras, Ao vivo, Gravações, Ajustes, Adicionar câmera, diálogo da nuvem).
3. Supabase: esquema, RLS, login e canais Realtime.
4. Hub: pareamento, ONVIF, go2rtc, gravação.
5. Nuvem: Google Drive, OneDrive e iCloud.
6. Ao vivo remoto: WebRTC, TURN e fallback HLS.
7. Notificações de movimento.
8. Qualidade: testes, e2e com Maestro e builds EAS.
