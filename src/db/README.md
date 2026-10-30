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
- `pnpm content:copy-prod-to-staging` copia só o schema `content` (site, serviços, depoimentos e perguntas) e as imagens `uuid.webp` referenciadas no bucket `site-public` da produção para o staging. Não lê `.env`, `.env.local` nem arquivo nenhum. Não toca em `identity` nem `clinic`. Zera `updated_by` porque o UUID da produção não existe no staging. A origem abre com `default_transaction_read_only=on` e lê dentro de `SET TRANSACTION READ ONLY`. O destino precisa ser o `STAGING_PROJECT_REF`; a origem, o `PRODUCTION_PROJECT_REF`. Sem `--dry-run` o script esvazia as quatro tabelas de conteúdo do staging numa única transação; isso só roda com `--confirm=copy-content-production-to-staging` e autorização explícita no chat.

As credenciais saem só de variáveis de ambiente da sessão do terminal. Não grave em arquivo, perfil do shell nem histórico. No bash, um espaço antes do `export` evita o histórico se `ignorespace` estiver ligado. No PowerShell, use `$env:NOME='...'` na janela e não chame `[Environment]::SetEnvironmentVariable`. Feche o terminal ao terminar.

Leitura (só conta, não grava). O log mostra host e project-ref, nunca senha nem chave:

```text
$env:SOURCE_PRODUCTION_DATABASE_URL='...'
$env:TARGET_STAGING_DATABASE_URL='...'
$env:PRODUCTION_PROJECT_REF='...'
$env:STAGING_PROJECT_REF='...'
pnpm content:copy-prod-to-staging -- --dry-run
```

Cópia (apaga o conteúdo atual do staging e grava o da produção, na mesma transação). Além das URLs e dos refs, exige a URL pública da produção — as imagens saem por ela, sem a chave de serviço — e o Storage do staging:

```text
$env:PRODUCTION_NEXT_PUBLIC_SUPABASE_URL='...'
$env:STAGING_NEXT_PUBLIC_SUPABASE_URL='...'
$env:STAGING_SUPABASE_SERVICE_ROLE_KEY='...'
pnpm content:copy-prod-to-staging -- --confirm=copy-content-production-to-staging
```

As URLs de banco precisam ser `postgres.<project-ref>` (papel das migrations), não `app_runtime`. O hostname do pooler pode ser igual nos dois projetos; o script compara o `<ref>` com `PRODUCTION_PROJECT_REF` e `STAGING_PROJECT_REF`. Refs trocados são recusados.

Depois da cópia, rode de novo o workflow Staging na `main` (Actions → Staging → Run workflow). O site público lê o conteúdo com `'use cache'`; uma escrita direta no banco não invalida esse cache. Sem um deploy novo, o staging continua mostrando a página antiga.

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
