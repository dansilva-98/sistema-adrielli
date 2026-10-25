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

## L1.2 — texto de privacidade

O texto de `/privacidade` é um rascunho para a responsável revisar antes do lançamento. Não é orientação jurídica. A spec não traz nome jurídico completo, CPF, CNPJ nem endereço da controladora: a página usa a marca Adrielli Flores e o `contact_email` do CMS. Confirmar o texto e se o aviso de rascunho deve sair da página depois da aprovação.

## E7.0 — horário do backup

A spec pede uma cópia por dia e perda máxima de 24 horas. Não fixa o relógio. O job ficou às 03:15 em America/Sao_Paulo (cron `15 6 * * *`), separado da rotina das 06:00 que mantém o banco acordado. Confirmar se outro horário fora do pico é preferível.

## E7.0 — ambiente GitHub

O ambiente `production` tem revisor obrigatório. Um job diário nesse ambiente esperaria um clique todo dia. O backup usa um ambiente novo, `backup`, só na `main`, sem revisor, com os segredos próprios. Confirmar.

## E7.0 — dados de auth

O dump inclui o schema `auth` e os dados de `auth.users`, `auth.identities` e `auth.mfa_factors`, como o `pnpm db:backup` local. Sessões, refresh tokens e desafios de MFA ficam de fora do arquivo de dados. Confirmar se a restauração precisa de mais alguma tabela de `auth`.

## E7.0 — bucket ainda inexistente

A E7.1 é que cria `clinic-private`. Enquanto o bucket não existe, o job grava o banco e registra `absent` dentro do arquivo criptografado, em vez de falhar. Confirmar se, depois que o bucket existir, a ausência dele deve passar a falhar o job.

## E7.0 — Storage público

O plano de publicação diz "arquivos do Storage". A E7.0 diz "bucket privado de anexos". Este PR inclui só `clinic-private`. O bucket público do site fica de fora.

## E7.0 — restauração real

Não foi executada. Faltam a chave privada age, os segredos do Drive e um projeto que possa ser apagado. O plano gratuito já ocupa staging e produção. O README descreve um Supabase local temporário, fora deste repositório. Confirmar se isso atende "projeto Supabase descartável" ou se a responsável autoriza outro caminho.
