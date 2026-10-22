# E0 — Fundação

Pré-leitura obrigatória: `00-regras-do-projeto.md`.
Depende de: nada. Bloqueia: todos os outros épicos.

## Objetivo

Deixar o repositório pronto para receber os épicos com segurança: projeto Next.js configurado, banco com schemas e migrations, ambientes separados, pipeline que impede merge com teste quebrado, monitoramento sem dados pessoais e a base visual do design system.

Ao fim do E0 **não existe nenhuma funcionalidade de negócio**: nem login, nem tabelas de negócio, nem telas de admin ou consultório.

## Pré-requisitos (feitos pela responsável do projeto, não pelo Cursor)

O Cursor não cria contas nem acessa painéis de fornecedores. Antes de começar, a responsável providencia e informa as variáveis de ambiente:

- [ ] Repositório no GitHub.
- [ ] Dois projetos no Supabase (staging e produção), na região de São Paulo se disponível no plano.
- [ ] Projeto na Vercel ligado ao repositório, em plano que permita uso comercial.
- [ ] Projeto no Sentry.
- [ ] Conta no Resend com o domínio próprio verificado (SPF, DKIM, DMARC). Pode ficar pronto até o E5.

## Fora do escopo

- Autenticação, papéis, telas de `/admin` e `/consultorio` (E1).
- Qualquer tabela de negócio (E2 em diante).
- Conteúdo do site (E2).

## Tarefas

Execute na ordem. Um PR por tarefa.

### T0.1 — Projeto base

- Criar app Next.js (App Router) com TypeScript `strict`, pnpm, ESLint e Prettier.
- Criar a estrutura de pastas da seção 4 das regras (pastas vazias com `.gitkeep` onde necessário).
- Configurar `eslint-plugin-boundaries` (ou equivalente) com as fronteiras entre módulos descritas nas regras. Incluir um teste do lint que falhe se `app/(public)` importar `modules/clinic`.
- Configurar `server-only` nos módulos de servidor para que importá-los num componente de cliente quebre o build.
- Scripts no `package.json`: `dev`, `build`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`.

### T0.2 — Variáveis de ambiente validadas

- Módulo `src/lib/env.ts` que valida as variáveis com Zod na inicialização, separado em `serverEnv` (com `server-only`) e `clientEnv` (apenas `NEXT_PUBLIC_*`).
- Variável ausente ou inválida impede a aplicação de subir, com mensagem que nomeia a variável (sem mostrar o valor).
- `.env.example` com todas as variáveis, sem valores reais. `.env*` no `.gitignore`, exceto o exemplo.
- Variáveis esperadas: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `APP_ENV` (`development` | `staging` | `production`), `NEXT_PUBLIC_SITE_URL`.

### T0.3 — Banco, schemas e migrations

- Configurar Drizzle com conexão **apenas no servidor** (`src/db/client.ts` com `server-only`), pool adequado a ambiente serverless.
- Migration inicial que:
  1. Cria os schemas `identity`, `content`, `commerce`, `clinic`, `audit`.
  2. Revoga dos papéis `anon` e `authenticated` qualquer uso desses schemas (`REVOKE ALL ON SCHEMA … FROM anon, authenticated`), para que a chave pública do Supabase não alcance tabelas da aplicação.
  3. Define privilégios padrão para que tabelas futuras nesses schemas também não sejam concedidas a `anon` e `authenticated`.
- Padrão documentado (em `src/db/README.md`) para toda tabela futura: criada num desses schemas, com RLS ligada e sem políticas para `anon`/`authenticated`.
- Script de seed (`db:seed`) que só roda em `development` e recusa executar em outro ambiente.
- No README do projeto, um checklist manual para cada projeto Supabase: na configuração da API de dados, **não** expor os schemas `identity`, `content`, `commerce`, `clinic` e `audit`.

### T0.4 — Ambiente local

- Supabase CLI para rodar Postgres, Auth e Storage localmente (`supabase start`).
- `pnpm dev` funcionando contra o ambiente local, com migrations aplicadas e seed.
- README com o passo a passo do zero até a aplicação rodando.

### T0.5 — Testes

- Vitest configurado para `tests/unit` e `tests/integration`.
- Testes de integração rodam contra um banco local descartável, recriado (migrations do zero) a cada execução da suíte.
- Playwright configurado para `tests/e2e`, com um teste de fumaça: a home responde 200 e mostra a marca.
- Testes de integração obrigatórios deste épico:
  - Os 5 schemas existem após as migrations.
  - Conectado como papel `anon`, qualquer consulta a esses schemas é negada.

### T0.6 — Pipeline (GitHub Actions)

- **Em todo pull request**: instalar dependências, lint, typecheck, testes de unidade, testes de integração (com a stack local do Supabase CLI no CI, porque um Postgres puro não tem os papéis `anon` e `authenticated` usados pelas migrations), build, teste de fumaça E2E. Qualquer falha bloqueia o merge.
- **Merge na branch principal**: aplicar migrations no banco de **staging** (segredo do CI) e deploy de staging pela Vercel.
- **Produção**: workflow manual (`workflow_dispatch`) que aplica migrations em produção e promove o deploy. Exige aprovação de ambiente protegido no GitHub.
- Nenhuma migration roda em produção automaticamente.
- Dependabot (ou equivalente) ligado para atualizações de segurança.

### T0.7 — Monitoramento e saúde

- Sentry no servidor e no navegador, com `environment` igual a `APP_ENV`.
- `beforeSend` que remove do evento: corpo de requisições, cookies, cabeçalhos de autorização, query strings e qualquer campo com nomes como `email`, `phone`, `token`, `code`, `password`, `cpf`. Teste de unidade comprovando a remoção.
- Replays de sessão desligados.
- Endpoint `GET /api/health` que verifica a conexão com o banco e responde `{ status: "ok" | "degraded" }`, sem versões, hosts ou mensagens de erro internas.

### T0.8 — Cabeçalhos de segurança

Configurar em `next.config` para todas as rotas:

- `Strict-Transport-Security` (produção e staging).
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Content-Security-Policy` inicial com `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` e origens explícitas para Supabase e Sentry. Documentar no PR como estender a política nos próximos épicos.
- `Permissions-Policy` desligando câmera, microfone e geolocalização.

### T0.9 — Base do design system

Direção aprovada: visual editorial, sério e acolhedor; terracota como cor principal, marrom escuro para texto, verde só como apoio, poucos elementos decorativos, sombras discretas.

- Tokens no Tailwind (cores, tipografia, espaçamentos, raios, sombras) como variáveis CSS, com nomes semânticos (`primary`, `text`, `muted`, `support`, `danger`, `surface`). Valores de cor iniciais podem ser provisórios; o importante é que nenhum componente use cor fixa fora dos tokens.
- Fontes via `next/font`: serifada para títulos, sans-serif para textos e controles.
- shadcn/ui inicializado com: Button, Input, Label, Textarea, Select, Checkbox, Dialog (confirmação), Toast, Table, Card, Badge, Skeleton, Form (com React Hook Form + Zod).
- Verificar contraste mínimo WCAG AA dos pares texto/fundo dos tokens; registrar o resultado no PR.
- Layout do site público (`app/(public)/layout.tsx`): header com a marca "Adrielli Flores" e os links Início, Sobre, Serviços, Materiais, Contato, rodapé simples, responsivo até 360 px de largura. As páginas ainda não têm conteúdo: a home mostra apenas o layout.

## Critérios de aceite

| #   | Critério                                                                                        | Como comprovar                                                                             |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A1  | Projeto roda localmente do zero seguindo só o README                                            | Roteiro manual no PR                                                                       |
| A2  | Variável de ambiente ausente impede a subida com mensagem clara, sem expor valores              | Teste de unidade do `env.ts`                                                               |
| A3  | Os 5 schemas existem e `anon` não os acessa                                                     | Testes de integração T0.5                                                                  |
| A4  | Importar `modules/clinic` em `app/(public)` quebra o lint                                       | Teste do lint                                                                              |
| A5  | Importar módulo de servidor em componente de cliente quebra o build                             | Verificação manual descrita no PR                                                          |
| A6  | PR com teste falhando não pode ser mesclado                                                     | Proteção de branch + execução de exemplo                                                   |
| A7  | Merge na principal aplica migrations em staging; produção só pelo workflow manual com aprovação | Execução registrada no PR                                                                  |
| A8  | Sentry não recebe dados pessoais                                                                | Teste de unidade do `beforeSend`                                                           |
| A9  | `/api/health` responde sem detalhes internos                                                    | Teste de integração                                                                        |
| A10 | Cabeçalhos de segurança presentes em todas as respostas                                         | Teste E2E que lê os cabeçalhos                                                             |
| A11 | Home renderiza o layout público em 360 px e 1280 px sem rolagem horizontal                      | Teste E2E com dois viewports                                                               |
| A12 | Nenhum segredo no repositório nem no bundle do navegador                                        | Busca no build (`.next/static`) pela service role key do ambiente de teste, descrita no PR |

## Entrega para auditoria

Conforme a seção 7 das regras: PRs, evidência de cada critério acima, saída dos testes, migrations, desvios e perguntas.
