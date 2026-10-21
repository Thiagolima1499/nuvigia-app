# Supabase do Nuvigia

Contas, cadastro de hubs e câmeras, eventos, gravações (metadados), ajustes e o canal em tempo real entre app e hub.
Vídeos, fotos, credenciais RTSP e tokens de nuvem **não** passam por aqui: ficam no hub e na nuvem da pessoa.

## Conteúdo

| Caminho | O que é |
| --- | --- |
| `migrations/…_schema.sql` | Tabelas `profiles`, `hubs`, `cameras`, `recordings`, `events`, `settings`, `pairing_codes`, `push_tokens` e as RPCs de pareamento |
| `migrations/…_rls.sql` | RLS: cada pessoa só vê o que é dela; cada hub só escreve no que é dele. Canais Realtime `hub:<id>` privados e bucket `thumbnails` |
| `migrations/…_cron.sql` | Marca hubs sem sinal como offline (pg_cron) |
| `functions/hub-register` | Cria a identidade de um hub novo (usuário do Auth com papel `hub`) |
| `tests/` | Testes de RLS e pareamento num Postgres local (`pnpm test:db`) |

## Como funciona o pareamento

1. O hub, na primeira vez, chama `hub-register` e recebe um e-mail/senha só dele (guardados criptografados no disco do hub).
2. O hub entra com essa conta e chama `create_pairing_code()`: um código de 6 dígitos que vale 10 minutos, mostrado no terminal e na página do hub (com QR code).
3. No app, a pessoa digita o código ou lê o QR. `claim_pairing_code(código)` vincula o hub à conta. São no máximo 10 tentativas a cada 10 minutos.

## Criar o projeto

1. Crie um projeto em [supabase.com](https://supabase.com) (o plano grátis serve).
2. Instale a CLI e vincule: `npx supabase login` e `npx supabase link --project-ref SEU_REF`.
3. Aplique o banco: `npx supabase db push`.
4. Publique a função: `npx supabase functions deploy hub-register`.
5. Defina o segredo de registro de hubs (use o mesmo valor no `.env` do hub):
   `npx supabase secrets set HUB_REGISTRATION_SECRET=$(openssl rand -hex 24)`.
6. Em Authentication › Providers, deixe **Email** ligado (código de 6 dígitos) e, se quiser, ligue **Google**.
   Em Authentication › URL Configuration, adicione `nuvigia://auth` às Redirect URLs.
7. Copie a URL e a chave `anon` (Project Settings › API) para `apps/mobile/.env` e `apps/hub/.env`.

## Testes

```bash
pnpm test:db   # precisa dos binários do PostgreSQL (initdb, pg_ctl, psql)
```

O script sobe um Postgres temporário, aplica um stub mínimo do Supabase (`tests/_stub_supabase.sql`), as migrações e roda `tests/rls_test.sql`.
