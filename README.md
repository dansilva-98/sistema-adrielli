# Ana Aprender

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

Abra `http://127.0.0.1:3000`. A home mostra o cabeçalho com a marca Ana Aprender, os links e o rodapé. Ainda não há conteúdo de página.

`pnpm env:local` só escreve `.env.local` se o arquivo não existir. Apague o arquivo para gerá-lo de novo. Ele não é commitado.

Se o Supabase local ainda não estiver no ar, copie `.env.example` para `.env.local` e preencha as chaves. Sem o Postgres, `pnpm dev` sobe, mas `GET /api/health` responde `{ "status": "degraded" }`.

## Scripts

| Comando                     | Função                                                 |
| --------------------------- | ------------------------------------------------------ |
| `pnpm dev`                  | Servidor de desenvolvimento                            |
| `pnpm build` / `pnpm start` | Build e servidor de produção                           |
| `pnpm lint`                 | ESLint, inclusive as fronteiras de módulo              |
| `pnpm typecheck`            | Tipos do Next e `tsc`                                  |
| `pnpm test`                 | Testes de unidade                                      |
| `pnpm test:integration`     | Schemas e papel `anon`, contra o Postgres local        |
| `pnpm test:e2e`             | Home, cabeçalhos e larguras 360 e 1280                 |
| `pnpm db:generate`          | Gera migration do Drizzle                              |
| `pnpm db:migrate`           | Aplica migrations                                      |
| `pnpm db:seed`              | Só com `APP_ENV=development` e banco em localhost      |
| `pnpm check:bundle`         | Falha se a service role key aparecer em `.next/static` |

## Variáveis

Estão em `.env.example`. Valor ausente ou inválido impede a subida e a mensagem cita o nome da variável, não o valor.

`DATABASE_URL` é a conexão do runtime e, neste épico, também das migrations. O E1 separa a URL de migration.

No ambiente local, use a conexão direta do Supabase (no exemplo, porta 54322). Em produção, `DATABASE_URL` deve usar o pooler do Supabase em modo transação, porta 6543. O cliente já abre essa conexão com `prepare: false` e `max: 1`.

## Supabase

Em cada projeto (local, staging e produção), na configuração da API de dados, não exponha os schemas `identity`, `content`, `commerce`, `clinic` e `audit`. O `supabase/config.toml` local também não os lista.

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
