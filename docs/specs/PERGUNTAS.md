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

Aprovado: 03:15 em America/Sao_Paulo (cron `15 6 * * *`), separado da rotina das 06:00 que mantém o banco acordado.

## E7.0 — ambiente GitHub

Aprovado: ambiente `backup`, só na `main`, sem revisor obrigatório. O ambiente `production` continua com revisor e não serve para a rotina diária.

## E7.0 — dados de auth

Aprovado: o dump inclui o schema `auth` e os dados de `auth.users`, `auth.identities` e `auth.mfa_factors`. Sessões, refresh tokens e desafios de MFA ficam de fora.

## E7.0 — bucket ainda inexistente

Enquanto o dump não tiver `clinic.patient_attachments`, a ausência de `clinic-private` segue só com o banco e fica registrada no arquivo criptografado. Depois da E7.1, essa ausência falha o job.

## E7.0 — Storage público

O backup inclui `site-public` junto com `clinic-private`. A ausência de `site-public` falha o job.

## E7.0 — restauração real

Um Supabase local temporário, fora deste repositório, atende ao projeto descartável. A responsável restaura com a chave privada, pelo README, com a orientação do Tech Lead, logo depois do primeiro backup real. O resultado fica registrado no PR ou numa issue.

## E7.0 — alerta de backup parado

O workflow Banco ativo consulta a API pública do GitHub, sem segredo, e falha se a última execução bem-sucedida do backup na `main` tiver 30 horas ou mais.
