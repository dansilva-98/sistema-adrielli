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
- `pnpm db:migrate` aplica as migrations usando `DATABASE_URL`.
- `pnpm db:seed` só executa quando `APP_ENV=development`. Neste épico não há tabela de negócio para popular.

Não use `supabase db reset` como caminho das migrations da aplicação: ele só aplica `supabase/migrations`. O histórico deste projeto está em `src/db/migrations`.
