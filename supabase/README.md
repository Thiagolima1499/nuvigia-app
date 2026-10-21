# Supabase do Nuvigia

Contas, cadastro de hubs e câmeras, eventos, gravações (metadados), ajustes e o canal em tempo real entre app e hub.
Vídeos, fotos, credenciais RTSP e tokens de nuvem **não** passam por aqui: ficam no hub e na nuvem da pessoa.

## Conteúdo

| Caminho | O que é |
| --- | --- |
| `migrations/…_schema.sql` | Tabelas `profiles`, `hubs`, `cameras`, `recordings`, `events`, `settings`, `pairing_codes`, `push_tokens` e as RPCs de pareamento |
| `migrations/…_rls.sql` | RLS: cada pessoa só vê o que é dela; cada hub só escreve no que é dele. Canais Realtime `hub:<id>` privados e bucket `thumbnails` |
| `migrations/…_cron.sql` | Marca hubs sem sinal como offline (pg_cron) |
| `migrations/…_notifications.sql` | Marca de evento já notificado e RPC `register_push_token` |
| `functions/hub-register` | Cria a identidade de um hub novo (usuário do Auth com papel `hub`) |
| `functions/turn-credentials` | Servidores STUN/TURN com senha temporária para o ao vivo remoto |
| `functions/notify-motion` | Notificação de movimento com foto (Expo Push → FCM/APNs) |
| `tests/` | Testes de RLS e pareamento num Postgres local (`pnpm test:db`) |

## Como funciona o pareamento

1. O hub, na primeira vez, chama `hub-register` e recebe um e-mail/senha só dele (guardados criptografados no disco do hub).
2. O hub entra com essa conta e chama `create_pairing_code()`: um código de 6 dígitos que vale 10 minutos, mostrado no terminal e na página do hub (com QR code).
3. No app, a pessoa digita o código ou lê o QR. `claim_pairing_code(código)` vincula o hub à conta. São no máximo 10 tentativas a cada 10 minutos.

## Criar o projeto

1. Crie um projeto em [supabase.com](https://supabase.com) (o plano grátis serve).
2. Instale a CLI e vincule: `npx supabase login` e `npx supabase link --project-ref SEU_REF`.
3. Aplique o banco: `npx supabase db push`.
4. Publique as funções: `npx supabase functions deploy hub-register turn-credentials notify-motion`.
5. Defina o segredo de registro de hubs (use o mesmo valor no `.env` do hub):
   `npx supabase secrets set HUB_REGISTRATION_SECRET=$(openssl rand -hex 24)`.
6. Em Authentication › Providers, deixe **Email** ligado (código de 6 dígitos) e, se quiser, ligue **Google**.
   Em Authentication › URL Configuration, adicione `nuvigia://auth` às Redirect URLs.
7. Copie a URL e a chave `anon` (Project Settings › API) para `apps/mobile/.env` e `apps/hub/.env`.

## Notificações de movimento

1. O hub registra o evento e chama `notify-motion` com o próprio login.
2. A função confere se o evento é daquele hub e se o aviso está ligado nos Ajustes. Ela manda no máximo uma notificação por câmera a cada minuto.
3. A notificação vai para os aparelhos do dono (tabela `push_tokens`, preenchida pelo app com `register_push_token`) com a foto do momento. A foto usa um link do bucket `thumbnails` que vale 1 hora.
4. Tocar na notificação abre a câmera ao vivo no app.

Para funcionar de verdade, é preciso:

- Um projeto no EAS (`eas init`) com o ID em `EAS_PROJECT_ID` no `apps/mobile/.env`.
- As credenciais de push no EAS (`eas credentials`): chave do Firebase (FCM v1) para Android e chave APNs para iOS.
- Opcional: `npx supabase secrets set EXPO_ACCESS_TOKEN=...`, se o envio seguro de push estiver ligado no projeto Expo.

A foto aparece direto na notificação no Android. No iOS, a notificação chega com o texto. Mostrar a imagem no iOS exige uma extensão nativa (Notification Service Extension), que fica para depois.

## Testes

```bash
pnpm test:db   # precisa dos binários do PostgreSQL (initdb, pg_ctl, psql)
```

O script sobe um Postgres temporário, aplica um stub mínimo do Supabase (`tests/_stub_supabase.sql`), as migrações e roda `tests/rls_test.sql`.
