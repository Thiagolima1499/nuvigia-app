# Configurar a nuvem (Google Drive, OneDrive e iCloud)

O login acontece no app, mas quem guarda o acesso é o hub. O app abre a tela de login do provedor (OAuth com PKCE) e manda o código de uso único para o hub pelo canal privado do Supabase.
O hub troca esse código pelos tokens e guarda tudo cifrado no disco. O app nunca recebe os tokens, só o status (conta, uso e espaço).

Escopos mínimos:

| Provedor | Acesso pedido | O que o Nuvigia enxerga |
| --- | --- | --- |
| Google Drive | `drive.file` | Só os arquivos que o próprio Nuvigia criou (pasta `Meu Drive/Nuvigia`) |
| OneDrive | `Files.ReadWrite.AppFolder offline_access` | Só a pasta do app (`OneDrive/Aplicativos/Nuvigia`) |
| iCloud | CloudKit, banco privado de `iCloud.br.com.nuvigia` | Só os registros do Nuvigia |

As gravações ficam em `Nuvigia/{Câmera}/{AAAA-MM-DD}/`, com o arquivo nomeado pela hora (`10-15-07.mp4`).

## Google Drive

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Drive API**.
2. Em **Tela de consentimento OAuth**, preencha nome e e‑mail e adicione o escopo `.../auth/drive.file`. Enquanto o app estiver em teste, cadastre os e‑mails de quem vai testar.
3. Em **Credenciais › Criar ID do cliente OAuth**, crie:
   - **iOS**, com o bundle `br.com.nuvigia.app`;
   - **Android**, com o pacote `br.com.nuvigia.app` e o SHA‑1 da chave de assinatura (`eas credentials`). Em *Configurações avançadas*, ative **Esquema de URI personalizado**.
4. Coloque os IDs em `apps/mobile/.env`, em `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS` e `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`.
   O `app.config.ts` registra sozinho o esquema de retorno (`com.googleusercontent.apps.…:/oauthredirect`).

O hub não precisa de nada do Google: ele recebe do app o ID do cliente junto com o código.

## OneDrive

1. No [Microsoft Entra](https://entra.microsoft.com/), vá em **Registros de aplicativo › Novo registro**, com o nome **Nuvigia** (esse nome vira a pasta `Aplicativos/Nuvigia`).
   Em tipos de conta, escolha **contas em qualquer diretório e contas pessoais da Microsoft**.
2. Em **Autenticação › Adicionar plataforma › Aplicativos móveis e da área de trabalho**, adicione o URI de redirecionamento `nuvigia://oauth/microsoft`. Deixe **Permitir fluxos de cliente público** ligado.
3. Em **Permissões de API**, adicione as permissões delegadas do Microsoft Graph `Files.ReadWrite.AppFolder` e `offline_access`.
4. Coloque o **ID do aplicativo (cliente)** em `EXPO_PUBLIC_MICROSOFT_CLIENT_ID`.

## iCloud (CloudKit)

Precisa de uma conta Apple Developer.

1. No [CloudKit Console](https://icloud.developer.apple.com/), crie o container `iCloud.br.com.nuvigia` e ligue o iCloud com CloudKit no App ID `br.com.nuvigia.app`.
2. Em **Schema › Record Types**, crie o tipo `Clip` com os campos `file` (Asset), `path` (String), `name` (String) e `day` (String, marcado como *Queryable*).
   No ambiente de desenvolvimento o CloudKit cria o tipo sozinho no primeiro envio. Para produção, use **Deploy Schema Changes**.
3. Em **API Access › Tokens**, crie um token de API com **Sign in Callback: URL Redirect** apontando para `nuvigia://oauth/icloud`.
4. Coloque o token em `EXPO_PUBLIC_CLOUDKIT_API_TOKEN` (app) **e** em `CLOUDKIT_API_TOKEN` (hub). Use `development` em `EXPO_PUBLIC_CLOUDKIT_ENV` e `CLOUDKIT_ENV` até publicar.

Limites do iCloud:

- A Apple não oferece acesso do servidor ao iCloud Drive. Os clipes ficam no banco privado do CloudKit, contam na cota de iCloud da pessoa e são vistos pelo app Nuvigia.
  Copiar os clipes para a pasta `iCloud Drive/Nuvigia`, para aparecerem no app Arquivos do iPhone, exige código nativo do iOS. Isso fica para depois.
- O CloudKit não informa o espaço livre, então a cota mostra só o que o Nuvigia ocupa.
- O envio de cada clipe ao CloudKit é feito de uma vez, sem partes. Arquivos grandes demoram mais para mostrar o progresso.
- No Android o login funciona pelo navegador com a Conta Apple, mas não há pasta no Arquivos.

## Retenção e cota

O hub apaga da nuvem as gravações mais velhas que a retenção dos Ajustes ("Apagar após 30 dias"). Ele confere isso a cada 6 horas.
Quem desliga a opção fica com "nunca apagar". O uso e o espaço são atualizados a cada 30 minutos e depois de cada envio.

Trocar de provedor não move as gravações antigas: elas continuam no provedor anterior, e o hub apaga os tokens dele.
