# Testar o app completo no celular

Este é o roteiro para ver o Nuvigia funcionando de ponta a ponta: conta, hub, câmera, ao vivo, gravação na nuvem e notificação.
Sem nenhuma configuração, o app abre em **modo demonstração**, com dados simulados.

## 1. Supabase (uma vez)

Siga [supabase/README.md](../supabase/README.md#criar-o-projeto): crie o projeto, aplique o banco, publique as funções e defina `HUB_REGISTRATION_SECRET`.

## 2. Hub (no computador ou mini PC de casa)

Siga [apps/hub/README.md](../apps/hub/README.md). Sem equipamento no local, use uma VPS: [hub-na-nuvem.md](hub-na-nuvem.md). Ao subir, o hub mostra um código de 6 dígitos e um QR code no terminal e em `http://IP-DO-HUB:8787`.

## 3. Contas de nuvem (opcional)

Para gravar na nuvem, crie os clientes OAuth em [configurar-nuvem.md](configurar-nuvem.md). Dá para testar o resto sem isso.

## 4. Instalar o app no celular

O vídeo ao vivo e as notificações precisam de um build de desenvolvimento (o Expo Go não serve).

```bash
npm i -g eas-cli
cd apps/mobile
eas login
eas init                       # cria o projeto no EAS e mostra o ID → EAS_PROJECT_ID
```

Cadastre as variáveis do `apps/mobile/.env.example` no EAS (o `.env` local não vai para o build):

```bash
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value https://SEU-PROJETO.supabase.co
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value ...
# repita para as chaves de nuvem e para EAS_PROJECT_ID
```

Gere e instale:

```bash
eas build --profile development --platform android   # gera um link/QR do APK
eas build --profile development --platform ios        # precisa de conta Apple Developer; registre o iPhone com `eas device:create`
```

Com o app instalado, rode `pnpm mobile` no computador e abra o projeto pelo app (mesma rede Wi-Fi ou `--tunnel`).

Para um build que não depende do computador ligado, use `--profile preview`.

### Notificações

Antes do build, configure as credenciais de push com `eas credentials`: chave do Firebase (FCM v1) no Android e chave APNs no iOS.

## 5. Roteiro de teste

1. Entre com seu e-mail (código de 6 dígitos).
2. Pareie o hub com o código ou o QR.
3. Toque em **+**, escolha a câmera encontrada na rede, dê um nome e a senha da câmera.
4. Abra **Ver ao vivo** em casa e depois fora de casa (4G). Fora de casa, sem TURN configurado, algumas redes caem no plano B (HLS) ou não conectam.
5. Em **Ajustes**, conecte uma nuvem. Grave 10 segundos e confira o arquivo em `Nuvigia/<câmera>/<data>`.
6. Passe na frente da câmera: deve chegar uma notificação com foto (Android) em até alguns segundos.
7. Desligue a câmera da tomada: ela aparece como **Offline** em até 1 minuto.

## Teste automático (Maestro)

O fluxo principal (adicionar câmera → ao vivo → gravar → ver em Gravações) roda no modo demonstração:

```bash
curl -fsSL https://get.maestro.mobile.dev | bash
# com o app aberto num emulador ou celular, sem as variáveis do Supabase:
maestro test apps/mobile/.maestro/fluxo-principal.yaml
```
