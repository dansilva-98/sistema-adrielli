# Adrielli Flores

Monólito modular da plataforma. Este repositório está no E0: fundação, sem login e sem tabela de negócio.

## Pré-requisitos

- Node.js 24
- pnpm 10 (`corepack prepare pnpm@10.18.2 --activate`, ou o binário local)
- Docker, para `supabase start`
- Contas de Supabase, Netlify, Sentry e GitHub ficam com a responsável do projeto. O código não cria essas contas.

## Do zero até a aplicação

```powershell
pnpm install
pnpm exec supabase start
Remove-Item .env.local -ErrorAction SilentlyContinue
pnpm env:local
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abra `http://127.0.0.1:3000`. A home mostra o cabeçalho com a marca Adrielli Flores, os links e o rodapé. Ainda não há conteúdo de página.

`pnpm env:local` só escreve `.env.local` se o arquivo não existir. Apague o arquivo para gerá-lo de novo. Ele não é commitado.

Se o Supabase local ainda não estiver no ar, copie `.env.example` para `.env.local` e preencha as chaves. Sem o Postgres, `pnpm dev` sobe, mas `GET /api/health` responde `{ "status": "degraded" }`.

## Scripts

| Comando                             | Função                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Servidor de desenvolvimento                                                                  |
| `pnpm build` / `pnpm start`         | Build e servidor de produção                                                                 |
| `pnpm lint`                         | ESLint, inclusive as fronteiras de módulo                                                    |
| `pnpm typecheck`                    | Tipos do Next e `tsc`                                                                        |
| `pnpm test`                         | Testes de unidade                                                                            |
| `pnpm test:integration`             | Schemas e papel `anon`, no banco `adrielli_flores_test`                                      |
| `pnpm test:e2e`                     | Home, cabeçalhos e larguras 360 e 1280                                                       |
| `pnpm db:generate`                  | Gera migration do Drizzle                                                                    |
| `pnpm db:migrate`                   | Aplica migrations                                                                            |
| `pnpm db:seed`                      | Só com `APP_ENV=development` e banco em localhost                                            |
| `pnpm db:backup`                    | Dump local em `backups/`, só em development                                                  |
| `pnpm content:copy-prod-to-staging` | Conteúdo público (`content`) da produção para o staging. Não toca em usuários nem pacientes. |
| `pnpm admin:bootstrap`              | Cria o primeiro SUPER_ADMIN; recusa se já existir um                                         |
| `pnpm check:bundle`                 | Falha se a service role key aparecer em `.next/static`                                       |

## Variáveis

Estão em `.env.example`. Valor ausente ou inválido impede a subida e a mensagem cita o nome da variável, não o valor.

`DATABASE_URL` é a conexão de runtime, com o papel `app_runtime`. A aplicação não lê `MIGRATIONS_DATABASE_URL`: ela vale só para o `drizzle-kit` e para o passo de migration dos workflows. `TEST_DATABASE_URL` aponta para o banco `adrielli_flores_test` com o mesmo papel de runtime. `pnpm content:copy-prod-to-staging` não lê `.env` nem `.env.local`: as variáveis `SOURCE_PRODUCTION_DATABASE_URL`, `TARGET_STAGING_DATABASE_URL`, `PRODUCTION_PROJECT_REF` e `STAGING_PROJECT_REF` ficam só na sessão do terminal. Não grave em arquivo nem no histórico do shell; feche a janela ao terminar. O passo a passo está em `src/db/README.md`.

No ambiente local, use a conexão direta do Supabase (no exemplo, porta 54322). Em staging e produção, `DATABASE_URL` usa o pooler em modo transação, porta 6543, usuário `app_runtime.<ref>`. O cliente já abre essa conexão com `prepare: false`, `max: 1`, `statement_timeout` de 10 s e `max_lifetime` de 4 min, menor que os 5 min em que o Supavisor fecha a conexão ociosa. A leitura pública desiste em 5 s, mostra o conteúdo vazio e registra a falha no Sentry. `MIGRATIONS_DATABASE_URL` usa o Session pooler, porta 5432, usuário `postgres.<ref>`, no host que o painel mostra em Connect. A conexão direta do banco hospedado é IPv6; o GitHub Actions só alcança o pooler.

## Supabase

Em cada projeto (local, staging e produção), na configuração da API de dados, não exponha os schemas `identity`, `content`, `commerce`, `clinic` e `audit`. O `supabase/config.toml` local também não os lista.

O convite da equipe usa o modelo `supabase/templates/invite.html`, com o link `{{ .SiteURL }}/equipe/primeiro-acesso?token_hash={{ .TokenHash }}`. No Supabase local isso vem do `config.toml`. Em staging e produção o mesmo assunto e o mesmo HTML precisam ser configurados no painel do Auth. Sem isso, a pessoa convidada não consegue criar a senha.

No Supabase de staging, a Site URL é `https://staging--adrielli-flores.netlify.app`. As URLs de redirecionamento são:

- `https://staging--adrielli-flores.netlify.app/equipe/primeiro-acesso`
- `https://staging--adrielli-flores.netlify.app/equipe/redefinir-senha`

Em produção, a Site URL é `https://adrielliflores.com.br`. As URLs de redirecionamento são:

- `https://adrielliflores.com.br/equipe/primeiro-acesso`
- `https://adrielliflores.com.br/equipe/redefinir-senha`

O cadastro aberto fica desligado com `enable_signup = false` em `[auth]` no `config.toml` local. Com isso, `POST /auth/v1/signup` usando a chave pública é recusado. Em `[auth.email]`, `enable_signup` continua `true`: neste Auth, `false` desliga o provedor de e-mail inteiro e impede o login e o convite da equipe. Em staging e produção o equivalente é desligar o cadastro de novos usuários no painel do Auth, sem desativar o provedor de e-mail. Esse ajuste permanece até o E4 decidir como o login do cliente cria contas. O convite da equipe e o `pnpm admin:bootstrap` usam a API de administração e continuam funcionando.

Checklist do banco e o padrão de RLS: `src/db/README.md`.

## Pipeline

O Git não publica o site. O site da Netlify não fica ligado ao repositório, então um push não publica sozinho.

- Todo pull request roda `.github/workflows/ci.yml`. Qualquer falha bloqueia o merge depois que a proteção da branch `main` estiver ligada. Passos em `docs/specs/E0-verificacao-manual.md`.
- Push em `main` roda `.github/workflows/staging.yml` só quando a variável `STAGING_ENABLED` do ambiente `staging` é `true`. As migrations usam `STAGING_MIGRATIONS_DATABASE_URL`, só nesse passo. O deploy é `netlify deploy --context deploy-preview --alias staging`, sem `--prod`. O endereço fixo do rascunho é `https://staging--adrielli-flores.netlify.app`. `NEXT_PUBLIC_SITE_URL` desse ambiente sai de `scripts/netlify-site.mjs` e é esse endereço, nunca o de produção. A URL de migration não é enviada à Netlify.
- Produção só pelo workflow manual `Production`, na `main`, no ambiente GitHub `production`, com revisor obrigatório. O job exige a variável `NETLIFY_SITE_ID` e não procura nem cria site. `NEXT_PUBLIC_SITE_URL` de produção sai da mesma função e é `https://adrielliflores.com.br`. Depois das migrations, roda `netlify deploy --prod`.
- O primeiro SUPER_ADMIN sai do workflow manual `Primeiro administrador`, só na `main`. O destino padrão é `production`: ambiente `production`, segredos `PRODUCTION_*` e `NEXT_PUBLIC_SITE_URL` `https://adrielliflores.com.br`. A opção `staging` usa o ambiente `staging`, os segredos `STAGING_*`, `APP_ENV` `staging` e `NEXT_PUBLIC_SITE_URL` `https://staging--adrielli-flores.netlify.app`. O e-mail é a entrada e fica mascarado no log. O convite sai pelo SMTP do Resend já configurado na Supabase daquele destino, com o modelo `supabase/templates/invite.html`. Este workflow não altera o SMTP.
- O site se chama `adrielli-flores`. Só o workflow de staging cria esse nome, se ele ainda não existir.
- A CLI fica fixa em `netlify-cli@27.14.2`. O plugin `@netlify/plugin-nextjs` fica em `5.16.4`. O build roda no GitHub Actions.
- Dependabot abre PRs de segurança em `.github/dependabot.yml`.
- `.github/workflows/keep-database-awake.yml` chama `GET /api/health` da produção e do staging uma vez por dia, às 06:00 em America/Sao_Paulo (09:00 UTC). O health consulta o banco, então o projeto gratuito da Supabase não fica sete dias sem atividade. As URLs são as variáveis de repositório `PRODUCTION_PUBLIC_URL` e `STAGING_PUBLIC_URL`. Não são segredos e não ficam no arquivo do workflow. Se uma delas não responder `{ "status": "ok" }`, o job falha e o GitHub avisa como em qualquer workflow que falha. O mesmo job consulta a API pública do GitHub, sem token e sem segredo, e falha se a última execução bem-sucedida do backup na `main` tiver 30 horas ou mais. Assim um agendamento pulado também gera o e-mail de falha.

O GitHub desativa workflows agendados de repositório público que fica 60 dias sem atividade (sem push e sem outra atividade no repositório). A pessoa dona do repositório recebe um e-mail. Para reativar: abra a aba Actions, escolha o workflow **Banco ativo** e clique em **Enable workflow**. Um commit novo no repositório também volta a permitir o agendamento. A rotina só passa a rodar sozinha depois que este workflow está na `main`.

## Backup de produção

`pnpm db:backup` continua sendo só o dump local de development. O backup de produção é `.github/workflows/backup.yml`. Ele roda todo dia às 03:15 em America/Sao_Paulo (cron `15 6 * * *`) e também pode ser disparado à mão. A perda máxima desenhada é de 24 horas.

O job usa o ambiente GitHub `backup`, não o ambiente `production`. O de produção tem revisor obrigatório; a rotina diária não pode esperar um clique. Esse job não publica o site.

O que entra no arquivo, ainda no runner:

1. Dump do banco de produção, com a URL de migration (papel `postgres`, pooler de sessão, porta 5432). Entra o schema `auth` e os dados de `auth.users`, `auth.identities` e `auth.mfa_factors`. Sessões e refresh tokens ficam de fora. Em seguida vêm os schemas da aplicação.
2. Arquivos do bucket privado `clinic-private`. Enquanto o dump não tiver a tabela `clinic.patient_attachments` da E7.1, a ausência desse bucket segue só com o banco e fica registrada no arquivo criptografado. Depois da E7.1, a ausência falha o job.
3. Arquivos do bucket público `site-public`. A ausência desse bucket falha o job.
4. `age` criptografa o conjunto com a chave pública de `ops/backup/age-recipient.txt`. O texto puro é apagado do runner antes do envio. O arquivo só sai se começar com o cabeçalho do age.

O destino é uma pasta `adrielli-flores-backups` criada na conta Google da responsável pelo escopo `https://www.googleapis.com/auth/drive.file`. O job guarda 30 cópias diárias. Um segundo disparo no mesmo dia substitui a cópia daquele dia. Não há artefato do GitHub: o repositório é público.

Enquanto a chave pública não estiver naquela linha `age1...` e os segredos abaixo não existirem, o job falha de propósito. Falha silenciosa esconderia a falta do backup. Não faça merge antes dessa configuração se não quiser um aviso diário.

### O que configurar

Chave age, no computador da responsável, fora do repositório:

```text
age-keygen -o age-identity.txt
```

A linha `age1...` vai para `ops/backup/age-recipient.txt`. A linha `AGE-SECRET-KEY-1...` vai para o gerenciador de senhas e sai do computador de trabalho. Esse arquivo não entra no Git.

No Google Cloud, um projeto gratuito só para este backup:

- Ativar a API Google Drive.
- Tela de consentimento OAuth externa, status **Em produção**, único escopo `https://www.googleapis.com/auth/drive.file`. Em modo teste o refresh token expira em 7 dias.
- Cliente OAuth do tipo **App para computador**. Não criar cliente Web.
- Na máquina dela: `node scripts/backup-drive-authorize.mjs`, com `BACKUP_DRIVE_CLIENT_ID` e `BACKUP_DRIVE_CLIENT_SECRET` só no ambiente. O script cria a pasta e mostra o id e o refresh token uma vez. Não gravar o token em arquivo do repositório.

Ambiente GitHub `backup`, restrito à branch `main`, sem revisor obrigatório. Segredos só desse ambiente:

| Nome                               | Valor                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `BACKUP_DATABASE_URL`              | URL de migration de produção. Porta 5432, não 6543.                     |
| `BACKUP_SUPABASE_URL`              | URL HTTPS do Supabase de produção.                                      |
| `BACKUP_SUPABASE_SERVICE_ROLE_KEY` | Service role de produção, só para ler `clinic-private` e `site-public`. |
| `BACKUP_DRIVE_CLIENT_ID`           | Id do cliente OAuth.                                                    |
| `BACKUP_DRIVE_CLIENT_SECRET`       | Segredo desse cliente.                                                  |
| `BACKUP_DRIVE_REFRESH_TOKEN`       | Token gerado pelo script, escopo `drive.file`.                          |
| `BACKUP_DRIVE_FOLDER_ID`           | Id da pasta `adrielli-flores-backups`.                                  |

Não conceder o escopo `https://www.googleapis.com/auth/drive`, Gmail, Calendar, delegação de domínio, nem compartilhar o Drive inteiro. Não colocar esses segredos no repositório, no log ou em artefato.

### Restaurar num projeto descartável

Este teste não foi executado neste PR: faltam a chave privada, os segredos do Drive e um projeto que possa ser apagado. O plano gratuito já usa os dois projetos de nuvem. O roteiro abaixo usa um Supabase local temporário, fora deste working tree, para não pausar staging nem produção. Repetir a cada 3 meses. Apagar o temporário é comando destrutivo e só acontece com autorização explícita.

1. Baixar o `.age` pelo navegador, na conta dona da pasta. O aplicativo não recebe acesso ao resto do Drive.
2. Descriptografar fora do repositório: `age -d -i age-identity.txt -o backup.tar adrielli-flores-backup-AAAAMMDD.age`.
3. Extrair: `tar -xf backup.tar`. O `manifest.json` diz se o bucket privado entrou, se estava vazio ou se ainda não existia, e se o `site-public` entrou.
4. Num diretório temporário, fora deste repositório, criar um projeto Supabase só para o teste (`supabase init` e `supabase start`). Não mudar o `project_id` deste repositório. Não usar o banco `postgres` de development nem `adrielli_flores_test`.
5. Criar nesse stack um banco vazio, por exemplo `adrielli_flores_restore_check`.
6. Aplicar `database.sql` como `supabase_admin`, com `ON_ERROR_STOP=1`. O schema `auth` exige esse papel. O destino precisa estar sem os schemas da aplicação.
7. Conferir que `auth.users` e `identity.users` voltaram e que as chaves batem. Conferir que existem `identity`, `content`, `commerce`, `clinic` e `audit`.
8. Se o manifesto disser que o bucket privado entrou, criar `clinic-private` nesse projeto temporário e enviar os arquivos de `storage/clinic-private/`. A quantidade de objetos tem de ser a do manifesto. Fazer o mesmo com `site-public` e `storage/site-public/` quando `public_bucket_status` for `included`.
9. Apagar o tar, o SQL e a cópia da chave privada da máquina de teste. Parar e remover o stack temporário só com autorização explícita.

### Domínio

O endereço do site é `https://adrielliflores.com.br`, sem `www`. O `www.adrielliflores.com.br` redireciona para ele. O workflow de produção grava o apex como domínio principal na Netlify e o `www` como alternativa. O `netlify.toml` também responde com 301 de `https://www.adrielliflores.com.br/*` para `https://adrielliflores.com.br/:splat`. O HTTPS é gerado pela Netlify.

O DNS continua no Registro.br, que já está em modo avançado. Não troque os servidores DNS. O Registro.br não oferece ALIAS, então o apex é um registro A. Não altere os registros de e-mail que já existem: `resend._domainkey`, `rsend` e `send`.

1. Domínio sem `www`. No modo avançado, crie um A do apex para `75.2.60.5`.
2. `www`. Crie um CNAME de `www` para `adrielli-flores.netlify.app`.
3. Redirecionamento. Com o apex como domínio principal, a Netlify redireciona o `www` para `https://adrielliflores.com.br`.
4. HTTPS. Depois que os dois registros responderem, a Netlify emite o certificado.

### Créditos da Netlify

O plano gratuito do time tem 300 créditos por mês, compartilhados com os outros sites. No teste da H1.1 o período virava no dia 26.

- Cada publicação de produção custa 15 créditos. Oito publicações custam 120, fora o tráfego.
- Rascunho não gasta crédito de publicação.
- O tráfego soma 3 créditos a cada 10 mil requisições e 10 créditos por GB.
- Se os créditos acabam, o site sai do ar até o período reiniciar. Dá para acompanhar em Team overview → Usage. A API do plano não informa o crédito já gasto; esse número está no painel.

## Design

Tokens em `src/app/globals.css`: `surface`, `text`, `muted`, `primary`, `support`, `danger`. Contraste em `docs/specs/contraste.md`. Componentes em `src/components/ui`. A CSP e como estendê-la estão em `docs/specs/csp.md`.

## Fora deste épico

Login, papéis, `/admin` e `/consultorio` são o E1 e dependem da auditoria deste E0.
