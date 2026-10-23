# Adrielli Flores

Monólito modular da plataforma. Este repositório está no E0: fundação, sem login e sem tabela de negócio.

## Pré-requisitos

- Node.js 24
- pnpm 10 (`corepack prepare pnpm@10.18.2 --activate`, ou o binário local)
- Docker, para `supabase start`
- Contas de Supabase, Vercel, Sentry e GitHub ficam com a responsável do projeto. O código não cria essas contas.

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

| Comando                     | Função                                                  |
| --------------------------- | ------------------------------------------------------- |
| `pnpm dev`                  | Servidor de desenvolvimento                             |
| `pnpm build` / `pnpm start` | Build e servidor de produção                            |
| `pnpm lint`                 | ESLint, inclusive as fronteiras de módulo               |
| `pnpm typecheck`            | Tipos do Next e `tsc`                                   |
| `pnpm test`                 | Testes de unidade                                       |
| `pnpm test:integration`     | Schemas e papel `anon`, no banco `adrielli_flores_test` |
| `pnpm test:e2e`             | Home, cabeçalhos e larguras 360 e 1280                  |
| `pnpm db:generate`          | Gera migration do Drizzle                               |
| `pnpm db:migrate`           | Aplica migrations                                       |
| `pnpm db:seed`              | Só com `APP_ENV=development` e banco em localhost       |
| `pnpm db:backup`            | Dump local em `backups/`, só em development             |
| `pnpm admin:bootstrap`      | Cria o primeiro SUPER_ADMIN; recusa se já existir um    |
| `pnpm check:bundle`         | Falha se a service role key aparecer em `.next/static`  |

## Variáveis

Estão em `.env.example`. Valor ausente ou inválido impede a subida e a mensagem cita o nome da variável, não o valor.

`DATABASE_URL` é a conexão de runtime, com o papel `app_runtime`. `MIGRATIONS_DATABASE_URL` é a conexão do dono, usada só pelo `drizzle-kit` e pelo CI. A senha de `app_runtime` em staging e produção fica fora do repositório: os segredos são `STAGING_MIGRATIONS_DATABASE_URL` e `PRODUCTION_MIGRATIONS_DATABASE_URL`. `TEST_DATABASE_URL` aponta para o banco `adrielli_flores_test` com o mesmo papel de runtime.

No ambiente local, use a conexão direta do Supabase (no exemplo, porta 54322). Em staging e produção, `DATABASE_URL` usa o pooler em modo transação, porta 6543, com o papel `app_runtime`. O cliente já abre essa conexão com `prepare: false` e `max: 1`.

`MIGRATIONS_DATABASE_URL` em staging e produção usa o Session pooler (Connect → Session pooler): host `aws-0-<região>.pooler.supabase.com`, porta 5432, usuário `postgres.<project-ref>`. A conexão direta do banco é IPv6, e o GitHub Actions só tem IPv4.

## Supabase

Em cada projeto (local, staging e produção), na configuração da API de dados, não exponha os schemas `identity`, `content`, `commerce`, `clinic` e `audit`. O `supabase/config.toml` local também não os lista.

O convite da equipe usa o modelo `supabase/templates/invite.html`, com o link `{{ .SiteURL }}/equipe/primeiro-acesso?token_hash={{ .TokenHash }}`. No Supabase local isso vem do `config.toml`. Em staging e produção o mesmo assunto, o mesmo HTML e a URL `https://<domínio>/equipe/primeiro-acesso` na lista de redirecionamentos precisam ser configurados no painel do Auth. Sem isso, a pessoa convidada não consegue criar a senha.

O cadastro aberto fica desligado com `enable_signup = false` em `[auth]` no `config.toml` local. Com isso, `POST /auth/v1/signup` usando a chave pública é recusado. Em `[auth.email]`, `enable_signup` continua `true`: neste Auth, `false` desliga o provedor de e-mail inteiro e impede o login e o convite da equipe. Em staging e produção o equivalente é desligar o cadastro de novos usuários no painel do Auth, sem desativar o provedor de e-mail. Esse ajuste permanece até o E4 decidir como o login do cliente cria contas. O convite da equipe e o `pnpm admin:bootstrap` usam a API de administração e continuam funcionando.

Checklist do banco e o padrão de RLS: `src/db/README.md`.

## Pipeline

Os deploys saem só destes workflows. `vercel.json` desliga o deploy automático da integração Git da Vercel, então um push não publica sozinho.

- Todo pull request roda `.github/workflows/ci.yml`. Qualquer falha bloqueia o merge depois que a proteção da branch `main` estiver ligada. Passos em `docs/specs/E0-verificacao-manual.md`.
- Push em `main` roda `.github/workflows/staging.yml`. As migrations usam os segredos do ambiente GitHub `staging`. O deploy é `vercel deploy` (Preview); as variáveis de runtime ficam na Vercel no escopo **Preview**.
- Produção só pelo workflow manual `Production`, no ambiente GitHub `production`, com revisor obrigatório. Depois das migrations, o job roda `vercel deploy --prod`, que constrói com as variáveis do escopo **Production** da Vercel.
- O plano atual da Vercel é Hobby. Não há ambiente customizado `staging`. Uso comercial exige plano Pro antes da primeira venda e da divulgação dos serviços.
- Dependabot abre PRs de segurança em `.github/dependabot.yml`.

## Design

Tokens em `src/app/globals.css`: `surface`, `text`, `muted`, `primary`, `support`, `danger`. Contraste em `docs/specs/contraste.md`. Componentes em `src/components/ui`. A CSP e como estendê-la estão em `docs/specs/csp.md`.

## Fora deste épico

Login, papéis, `/admin` e `/consultorio` são o E1 e dependem da auditoria deste E0.
