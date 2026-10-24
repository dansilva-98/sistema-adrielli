# Perguntas

## E1

A spec de identidade foi recebida junto com o E0. Não foi implementada: o E1 declara dependência de E0 aprovado na auditoria.

## Seed

`pnpm db:seed` em `development` não insere linhas. O E0 proíbe tabela de negócio. Confirmar se o comando vazio, que só valida o ambiente, é o comportamento esperado.

## Toast

O registry atual do shadcn publica `toast` em cima de Base UI. O item `form` do mesmo registry não tem arquivos. O Form do projeto foi escrito com React Hook Form e Zod, como a spec pede. Sonner não foi mantido.

## APP_ENV no navegador

O Sentry do browser precisa do ambiente. `next.config.ts` embute `APP_ENV` como `NEXT_PUBLIC_APP_ENV`. O valor é `development`, `staging` ou `production`, não é segredo.

## CSP

`script-src` inclui `'unsafe-inline'` para o Next.js. Nonce fica para um épico futuro. Ver `docs/specs/csp.md`.

## Papéis anon e authenticated

A migration cria esses papéis se eles não existirem, para o `REVOKE` ser válido. No Supabase local eles já existem e o `CREATE` não roda.

## L1.1 — horário da rotina

A spec pede uma consulta por dia, fora do pico, e não fixa o relógio. A rotina ficou às 06:00 em America/Sao_Paulo (cron `0 9 * * *` em UTC). Confirmar se outro horário fora do pico é preferível.

## L1.1 — URLs públicas

Os nomes das variáveis de repositório são `PRODUCTION_PUBLIC_URL` e `STAGING_PUBLIC_URL`. A spec não publica os endereços. Enquanto a produção não responder em `/api/health`, a execução manual e a rotina diária falham, como a spec pede quando um health não responde. Confirmar os dois endereços antes de deixar o workflow na `main`, para o GitHub não avisar falha todo dia.

## Fora desta máquina

Docker não estava instalado, então `supabase start` não rodou aqui. Não há remoto GitHub: proteção de branch, Dependabot e os workflows de staging e produção estão no repositório e ainda não foram executados.
