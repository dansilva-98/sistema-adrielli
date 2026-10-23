# E1 — Identidade e acesso

Pré-leitura obrigatória: `00-regras-do-projeto.md`.
Depende de: E0 aprovado na auditoria. Bloqueia: E2, E3 e E7.

## Objetivo

A equipe entra com e-mail, senha e MFA; cada área (`/admin`, `/consultorio`) só abre para os papéis certos, com verificação no servidor; e toda ação sensível fica registrada numa trilha de auditoria que não pode ser alterada.

## Decisões já tomadas (não reabrir)

- Papéis: `SUPER_ADMIN`, `CONTENT_ADMIN`, `CLINIC_ADMIN`. No início, só a profissional, com `SUPER_ADMIN`.
- Matriz de acesso:

| Área              | CONTENT_ADMIN | CLINIC_ADMIN | SUPER_ADMIN |
| ----------------- | ------------- | ------------ | ----------- |
| `/admin`          | Sim           | Não          | Sim         |
| `/admin/usuarios` | Não           | Não          | Sim         |
| `/consultorio`    | Não           | Sim          | Sim         |

- **MFA (TOTP) obrigatório** para quem tem `CLINIC_ADMIN` ou `SUPER_ADMIN`, em qualquer área da equipe. Para `CONTENT_ADMIN`, opcional.
- Sessão da equipe: expira após **30 minutos de inatividade** e após **12 horas** do login, o que ocorrer primeiro.
- Não existe cadastro público de equipe. Novos membros só por convite de um `SUPER_ADMIN`.
- Clientes do marketplace terão login por código de e-mail no **E4**. Não implementar agora; apenas deixar o campo `kind` preparado.

## Pré-requisitos (responsável do projeto)

Decisão de 22/10: Supabase no **plano gratuito** até o go-live. O MFA por aplicativo (TOTP) e o SMTP próprio estão incluídos no gratuito; a tela "Upgrade to Pro" na área de MFA se refere ao MFA por **telefone**, que não usamos. Segundo a documentação oficial, o TOTP "é gratuito e vem ativado em todos os projetos por padrão".

O desenvolvimento do E1 **não depende** de nada abaixo: o Supabase local tem Auth, TOTP e uma caixa de e-mail de teste (Mailpit/Inbucket). Os itens só são necessários para usar staging e produção.

- [ ] Dois projetos no Supabase (staging e produção), na região São Paulo (`sa-east-1`) se ela aparecer na criação. O gratuito permite 2 projetos ativos por organização.
- [ ] URLs de redirecionamento de staging e produção cadastradas no Supabase Auth.
- [ ] Conferir que o TOTP está ativo em Auth → Multi-Factor nos dois projetos.
- [ ] **Staging:** pode usar o envio de e-mail padrão do Supabase (limitado e só para endereços da equipe do projeto). Basta para convidar a própria equipe.
- [ ] **Produção (antes do go-live):** domínio próprio verificado no Resend (SPF, DKIM, DMARC) e SMTP do Resend configurado no Supabase Auth.

## Instrução sobre pré-requisitos

Não espere os itens acima para implementar. Desenvolva e teste tudo contra o Supabase local. A verificação em staging fica para depois que a responsável criar os projetos.

## Fora do escopo

- Login de clientes (E4).
- Telas de conteúdo, produtos, pedidos ou pacientes (E2 em diante). Os menus das áreas mostram apenas o que este épico entrega.
- Recuperação de MFA por códigos de backup (registrar como pergunta se julgar necessário).

## Tarefas

### T1.1 — Papel de banco da aplicação

- Criar o papel `app_runtime` (com login) usado pela aplicação em tempo de execução. Migrations continuam rodando com o papel dono.
- `app_runtime` recebe `USAGE` nos 5 schemas e, nas tabelas, só os privilégios que cada uma precisa (definidos nas migrations de cada tabela).
- Separar as variáveis: `DATABASE_URL` (runtime, `app_runtime`) e `MIGRATIONS_DATABASE_URL` (dono, usado só pelo drizzle-kit e pelo CI). Atualizar `env.ts`, `.env.example`, pipeline e README.
- A senha de `app_runtime` em staging e produção é definida pela responsável, fora do repositório.

### T1.1b — Backup local inclui os usuários de autenticação

Herdado da auditoria do E0, rodada 3. Hoje o `pnpm db:backup` usa `supabase db dump`, que por padrão não inclui o schema `auth`. Como `identity.users` passa a referenciar `auth.users`, um backup sem esses usuários não restaura.

- O `db:backup` passa a incluir os dados de `auth.users`, e de `auth.identities` e `auth.mfa_factors` se forem usados.
- Teste manual descrito no PR: num banco local de rascunho criado só para isso (nunca o de desenvolvimento nem o de testes), restaurar o backup e conferir que `identity.users` e `auth.users` voltam consistentes.

### T1.2 — Tabelas

`identity.users`

- `id` uuid PK, referência a `auth.users(id)`, sem cascata.
- `kind` enum `STAFF` | `CUSTOMER`.
- `email` text, `display_name` text.
- `created_at`, `disabled_at` (nulo = ativo).

`identity.user_roles`

- `user_id` → `identity.users(id)`, `role` enum dos 3 papéis, PK (`user_id`, `role`).
- `granted_by` → `identity.users(id)`, `granted_at`.
- Restrição: só usuários `STAFF` podem ter papel (verificada no banco, por trigger ou constraint).

`audit.audit_log`

- `id` uuid, `occurred_at` timestamptz default `now()`.
- `actor_user_id` uuid nulo (nulo = anônimo ou sistema).
- `action` text, restrito à lista de eventos da T1.7.
- `entity_type` text nulo, `entity_id` uuid nulo.
- `ip` inet nulo.
- `metadata` jsonb default `{}`, validado por Zod antes de gravar; **nunca** com e-mail, nome, senha, código, token ou conteúdo clínico.
- Imutável: `app_runtime` só tem `INSERT` e `SELECT`; trigger `BEFORE UPDATE OR DELETE` que lança exceção, como segunda barreira.
- Índices: (`occurred_at`), (`actor_user_id`, `occurred_at`), (`entity_type`, `entity_id`).

Todas com RLS ligada e sem políticas para `anon`/`authenticated` (padrão do E0).

### T1.3 — Primeiro SUPER_ADMIN

- Script `pnpm admin:bootstrap -- --email <e-mail>` que cria o usuário no Supabase Auth (convite), a linha em `identity.users` (`STAFF`) e o papel `SUPER_ADMIN`.
- Só funciona se ainda não existir nenhum `SUPER_ADMIN`; caso contrário, recusa e sai com erro.
- Usa a service role key; roda pela linha de comando, nunca por rota HTTP.
- Grava `audit_log` com `action = user.bootstrap`.

### T1.4 — Login, MFA e sessão da equipe

Rotas (fora de `/admin` e `/consultorio`, para não exigir sessão):

- `/equipe/entrar` — e-mail e senha.
- `/equipe/mfa/configurar` — cadastro do TOTP com QR code e confirmação por um código válido.
- `/equipe/mfa/verificar` — código TOTP após a senha.
- `/equipe/redefinir-senha` — pedido e definição de nova senha pelo fluxo do Supabase.

Regras:

- O login é feito por **ação de servidor**, para registrar auditoria. Mensagem de erro única para e-mail inexistente e senha errada.
- Usuário `CUSTOMER` ou com `disabled_at` preenchido não entra nas áreas da equipe, mesmo com credenciais válidas.
- Se o usuário tem papel que exige MFA:
  - sem TOTP cadastrado → redireciona para `/equipe/mfa/configurar` e não acessa nenhuma área antes de concluir;
  - com TOTP → exige o código; a sessão só vale para as áreas quando estiver em nível `aal2`.
- **No servidor, a identidade vem sempre de um método que valida o token junto ao Supabase** (ex.: `getUser()`), nunca de dados de sessão lidos do cookie sem validação.
- Inatividade e duração máxima:
  - No login, gravar o horário de início; a cada requisição às áreas da equipe, atualizar o horário da última atividade. Ambos num cookie `HttpOnly`, `Secure`, `SameSite=Lax`, assinado com um segredo novo (`STAFF_SESSION_SECRET`).
  - Passou de 30 minutos sem atividade ou de 12 horas desde o login → encerrar a sessão no Supabase, apagar os cookies e redirecionar para `/equipe/entrar` com a mensagem "Sua sessão expirou por segurança. Entre novamente."
  - Os limites ficam em constantes únicas no módulo `identity` (não espalhadas pelo código).
- Sair: botão em ambas as áreas; encerra a sessão e grava auditoria.

### T1.5 — Guardas de acesso

No módulo `identity`, funções de servidor reutilizáveis:

- `requireStaff({ roles })`: valida a sessão, `kind = STAFF`, `disabled_at` nulo, nível `aal2` quando exigido, sessão dentro dos limites e pelo menos um dos papéis. Sem sessão → redireciona para login. Sem permissão → **403** e auditoria `access.denied`.
- `assertRole(roles)`: mesma verificação para uso dentro de funções de acesso a dados. O módulo `clinic` (épicos futuros) chamará `assertRole` em toda leitura e escrita, além da guarda da rota.
- Middleware do Next.js: só renova a sessão e redireciona quem não tem sessão em `/admin` e `/consultorio`. **Não** é a barreira de autorização: toda página, layout, ação de servidor e rota de API dessas áreas chama `requireStaff`.
- Teste automático que percorre todas as rotas e ações de servidor sob `app/admin` e `app/consultorio` e falha se alguma não chamar a guarda (por exemplo, varredura estática dos arquivos ou registro central de rotas). O objetivo é que uma rota nova esquecida quebre o CI.
- Rotas de API que alteram dados verificam o cabeçalho `Origin` contra `NEXT_PUBLIC_SITE_URL`.

### T1.6 — Áreas e gestão de usuários

Layouts (usar o design system do E0):

- `/admin`: cabeçalho com "Administração", menu lateral com "Dashboard" (página vazia com estado "Em construção") e, para `SUPER_ADMIN`, "Usuários" sob SISTEMA.
- `/consultorio`: cabeçalho com "Consultório", visual distinto do admin (mesmos componentes, identificação de área diferente), menu com "Dashboard" (vazio, "Em construção").
- Seletor de área visível só para quem tem acesso às duas.
- Funciona em celular (360 px): menu recolhível.

`/admin/usuarios` (apenas `SUPER_ADMIN`):

- Lista: nome, e-mail, papéis, MFA ativo (sim/não), situação (ativo/desativado), último login.
- Convidar: nome, e-mail, papéis → convite do Supabase por e-mail + `identity.users` + papéis, numa operação; se o convite falhar, nada é gravado.
- Alterar papéis e desativar/reativar, com diálogo de confirmação.
- Desativar: preenche `disabled_at`, bloqueia o usuário no Supabase Auth e encerra as sessões dele.
- **Nunca pode ficar sem `SUPER_ADMIN` ativo**: remover o papel ou desativar o último é recusado. A verificação acontece numa transação com bloqueio de linha, para que duas operações simultâneas não removam os dois últimos.
- Um usuário não pode desativar a si mesmo.
- Estados de carregando, vazio e erro; botões desabilitados durante o envio.

### T1.7 — Auditoria

Módulo `audit` com `recordAudit(event, tx?)`:

- Quando recebe uma transação, grava nela: se a auditoria falhar, a operação inteira falha (usar em mudanças de papel, convite, desativação).
- Eventos de login e acesso negado não bloqueiam o usuário se a gravação falhar, mas a falha vai para o Sentry.
- IP obtido do cabeçalho confiável da Vercel (`x-forwarded-for`, primeiro valor).

Eventos deste épico (`action`):
`user.bootstrap`, `auth.login.success`, `auth.login.failure`, `auth.logout`, `auth.session.expired`, `auth.mfa.enrolled`, `auth.mfa.failure`, `auth.password.reset`, `user.invited`, `user.role.granted`, `user.role.revoked`, `user.disabled`, `user.enabled`, `access.denied`.

Em `auth.login.failure` não gravar o e-mail digitado; gravar apenas o IP e, se o usuário existir, o `actor_user_id`.

## Critérios de aceite

| #   | Critério                                                                                                     | Como comprovar                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| A1  | Cada combinação de papel × área da matriz retorna o resultado esperado (acesso, redirect ou 403)             | Teste de integração com a matriz completa, incluindo anônimo e usuário `CUSTOMER` |
| A2  | Usuário com `SUPER_ADMIN` ou `CLINIC_ADMIN` sem MFA não acessa nenhuma área                                  | Teste E2E                                                                         |
| A3  | Sessão em `aal1` de usuário que exige MFA recebe redirect para verificação                                   | Teste de integração                                                               |
| A4  | Sessão expira após 30 min de inatividade e após 12 h do login                                                | Testes de unidade com relógio simulado + 1 teste E2E                              |
| A5  | Usuário desativado perde acesso imediatamente, inclusive com sessão já aberta                                | Teste de integração                                                               |
| A6  | Último `SUPER_ADMIN` não pode ser removido nem desativado, inclusive com duas requisições simultâneas        | Teste de integração com concorrência                                              |
| A7  | `UPDATE` e `DELETE` em `audit_log` falham para `app_runtime` e também pelo trigger                           | Teste de integração                                                               |
| A8  | Todos os eventos da T1.7 são gravados nos fluxos correspondentes, sem e-mail ou dados pessoais no `metadata` | Testes de integração                                                              |
| A9  | Uma rota ou ação nova em `/admin` ou `/consultorio` sem `requireStaff` quebra o CI                           | Teste da T1.5 + demonstração no PR                                                |
| A10 | Não existe rota pública de cadastro de equipe                                                                | Teste E2E: rota inexistente; varredura de rotas                                   |
| A11 | `bootstrap` recusa rodar se já existir `SUPER_ADMIN`                                                         | Teste de integração                                                               |
| A12 | Mensagem de erro de login idêntica para e-mail inexistente e senha errada                                    | Teste de integração                                                               |
| A13 | Chave pública do Supabase no navegador não lê `identity.*` nem `audit.*`                                     | Teste de integração com o cliente `anon`                                          |
| A14 | Layouts de `/admin` e `/consultorio` usáveis em 360 px e 1280 px                                             | Teste E2E com dois viewports                                                      |

## Entrega para auditoria

Conforme a seção 7 das regras: PRs, evidência de cada critério acima, saída dos testes, migrations, desvios e perguntas.
