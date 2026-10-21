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

O Expo Go serve para o modo demonstração. O vídeo ao vivo de verdade usa WebRTC (`react-native-webrtc`), que precisa do app instalado: um build de desenvolvimento (`npx expo run:ios` / `npx expo run:android`, ou `eas build --profile development`).

O app abre na tela **Câmeras**, com dados simulados. O **catálogo de componentes** e o simulador de estados (sem câmeras, hub inacessível, sem nuvem, falha de envio) abrem com um toque longo em “Nuvigia” no topo da tela Câmeras, ou pelo endereço `/catalogo` no navegador.

## Verificações

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Etapas

1. **Base:** monorepo, lint, TypeScript estrito, tema com os tokens, fontes, componentes base e catálogo.
2. **Telas com dados simulados** (Câmeras, Ao vivo, Gravações, Ajustes, Adicionar câmera, diálogo da nuvem).
3. Supabase: esquema, RLS, login e canais Realtime.
4. **Hub:** pareamento, ONVIF, go2rtc, gravação e detecção de movimento ([apps/hub](apps/hub/README.md)).
5. **Nuvem:** Google Drive, OneDrive e iCloud ([como configurar](docs/configurar-nuvem.md)).
6. **Ao vivo remoto:** WebRTC pelo Supabase Realtime, TURN (coturn) e plano B por HLS ([detalhes](apps/hub/README.md#ao-vivo-fora-de-casa)).
7. **Notificações de movimento** com foto, 1 por minuto por câmera ([detalhes](supabase/README.md#notificações-de-movimento)). ← atual
8. Qualidade: testes, e2e com Maestro e builds EAS.
