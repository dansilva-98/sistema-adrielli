# Banco

A aplicação acessa o Postgres só pelo servidor, via Drizzle (`src/db/client.ts`). A API de dados do Supabase não pode expor os schemas da aplicação.

## Schemas

`identity`, `content`, `commerce`, `clinic` e `audit`. Não criar tabela de aplicação em `public`.

## Tabela nova

Toda tabela futura segue este padrão, na migration que a cria:

1. Criar a tabela dentro de um dos cinco schemas.
2. Chave primária UUID. Datas em `timestamptz`. Dinheiro em centavos (`integer`).
3. Ligar Row Level Security.
4. Não criar política para `anon` nem `authenticated`.

```sql
ALTER TABLE identity.example ENABLE ROW LEVEL SECURITY;
```

A migration inicial revoga `USAGE` desses schemas para `anon` e `authenticated` e define privilégios padrão para que tabelas, sequências e funções criadas depois também não sejam concedidas a esses papéis.

O papel dono da migration continua com acesso. No E1, o runtime passa a usar `app_runtime`, com privilégios explícitos por tabela.

## Comandos

- `pnpm db:generate` gera a migration a partir de `src/db/schema`.
- `pnpm db:migrate` aplica as migrations usando `MIGRATIONS_DATABASE_URL`. Em `development`, o comando seguinte alinha a senha local de `app_runtime` com `DATABASE_URL`. Fora de development a senha não é alterada.
- `pnpm db:seed` só executa quando `APP_ENV=development` e o host de `DATABASE_URL` é `127.0.0.1` ou `localhost`. Neste épico não há tabela de negócio para popular.
- `pnpm db:backup` grava um dump local em `backups/` e só roda com `APP_ENV=development`. O arquivo sai nesta ordem: schema `auth`, dados de `auth.users`, `auth.identities` e `auth.mfa_factors`, schema da aplicação, dados da aplicação.

## Restaurar um backup local

O banco de destino precisa existir e estar vazio desses schemas. Não use `postgres` nem `adrielli_flores_test`. O arquivo roda inteiro, numa passada, como `supabase_admin`, porque o schema `auth` exige esse papel:

```text
docker cp backups/local-AAAAMMDD-HHMMSS.sql supabase_db_adrielli-flores:/tmp/restore.sql
docker exec supabase_db_adrielli-flores psql -U supabase_admin -d adrielli_flores_restore_check -v ON_ERROR_STOP=1 -f /tmp/restore.sql
docker exec supabase_db_adrielli-flores rm -f /tmp/restore.sql
```

Apagar ou esvaziar o banco de rascunho é um comando destrutivo e só acontece com autorização explícita.

O backup diário de produção é outro arquivo: sai criptografado com age e não usa `pnpm db:backup`. A restauração dele está no README da raiz, na seção "Backup de produção".

- `pnpm test:integration` usa `TEST_DATABASE_URL`, no banco `adrielli_flores_test`. É esse banco que o setup apaga e migra de novo. O banco `postgres` de desenvolvimento não entra nesse caminho.

Não use `supabase db reset` como caminho das migrations da aplicação: ele só aplica `supabase/migrations`. O histórico deste projeto está em `src/db/migrations`.

## Rollback da migration inicial

Só num ambiente sem dados de negócio. Apaga os cinco schemas da aplicação e o schema `drizzle`, onde fica a tabela de histórico do Drizzle:

```sql
DROP SCHEMA IF EXISTS identity, content, commerce, clinic, audit, drizzle CASCADE;
```

Em staging ou produção não há rollback automático. Reverter lá exige backup e uma decisão explícita.
