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
| `pnpm db:seed`              | Só em `APP_ENV=development`                            |
| `pnpm check:bundle`         | Falha se a service role key aparecer em `.next/static` |

## Variáveis

Estão em `.env.example`. Valor ausente ou inválido impede a subida e a mensagem cita o nome da variável, não o valor.

`DATABASE_URL` é a conexão do runtime e, neste épico, também das migrations. O E1 separa a URL de migration.

## Supabase

Em cada projeto (local, staging e produção), na configuração da API de dados, não exponha os schemas `identity`, `content`, `commerce`, `clinic` e `audit`. O `supabase/config.toml` local também não os lista.

Checklist do banco e o padrão de RLS: `src/db/README.md`.

## Pipeline

- Todo pull request roda `.github/workflows/ci.yml`. Qualquer falha bloqueia o merge depois que a proteção da branch `main` estiver ligada. Passos em `docs/specs/E0-verificacao-manual.md`.
- Push em `main` aplica migrations em staging e faz o deploy de staging. Desligue o deploy automático de produção na Vercel.
- Produção só pelo workflow manual `Production`, com o ambiente `production` protegido por aprovação.
- Dependabot abre PRs de segurança em `.github/dependabot.yml`.

## Design

Tokens em `src/app/globals.css`: `surface`, `text`, `muted`, `primary`, `support`, `danger`. Contraste em `docs/specs/contraste.md`. Componentes em `src/components/ui`. A CSP e como estendê-la estão em `docs/specs/csp.md`.

## Fora deste épico

Login, papéis, `/admin` e `/consultorio` são o E1 e dependem da auditoria deste E0.
