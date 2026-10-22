# Regras do projeto — Plataforma Adrielli Flores

Leia este arquivo antes de qualquer especificação de épico. Ele vale para todas as tarefas.
Sugestão: salvar como `docs/specs/00-regras-do-projeto.md` no repositório e também como regra do Cursor (`.cursor/rules/projeto.mdc`).

## 1. Contexto em uma frase

Plataforma de uma psicopedagoga com quatro áreas separadas — site público, marketplace de materiais digitais, painel administrativo (`/admin`) e painel do consultório (`/consultorio`) — num único app (monolito modular). O consultório guarda dados de saúde de crianças: segurança e autorização não são opcionais.

## 1.1 Nome do projeto (decisão de 22/10)

A marca é **Adrielli Flores**. Ela substitui "Ana Aprender" em todo lugar. Use sempre estes identificadores:

| Uso                                                          | Valor                   |
| ------------------------------------------------------------ | ----------------------- |
| Marca na interface, títulos e e-mails                        | Adrielli Flores         |
| Slug (pacote, `project_id` do Supabase, nomes em kebab-case) | `adrielli-flores`       |
| Identificadores em snake_case (bancos, papéis)               | `adrielli_flores`       |
| Banco dos testes de integração                               | `adrielli_flores_test`  |

Renomear um identificador técnico também é uma mudança de infraestrutura. Trocar o `project_id` cria um stack local novo, e o volume antigo deve ser preservado. Trocar o nome do banco de testes deixa o banco antigo para trás. Siga a regra 11: nada de reset ou exclusão sem autorização, e backup antes.

## 2. Regras de trabalho

1. **Implemente apenas o escopo do épico em execução.** Se algo parecer necessário e não estiver na especificação, pare e registre como pergunta em `docs/specs/PERGUNTAS.md`. Não crie telas, tabelas, rotas ou dependências extras "para o futuro".
2. **Não altere decisões de arquitetura.** Stack, separação de módulos, modelo de autorização e regras de negócio estão aprovados. Divergência = pergunta, não mudança.
3. **Toda regra de negócio fica no servidor.** O frontend nunca é a única barreira para permissão, preço, status ou validação.
4. **Negar por padrão.** Rota, ação de servidor ou endpoint sem declaração explícita de acesso deve ser bloqueado.
5. **Sem IA no código de produção** para datas, agenda, permissões, pagamento, preços, download, status ou validações.
6. **"Compilou" não é "funciona".** Cada critério de aceite precisa de um teste automatizado ou de um roteiro de verificação manual descrito no PR.
7. **Sem erros silenciosos.** Nada de `catch` vazio. Erro inesperado é registrado no monitoramento (sem dados pessoais) e o usuário vê uma mensagem compreensível.
8. **Sem dados pessoais em logs**: nada de nome, e-mail, telefone, conteúdo clínico, tokens, códigos de login ou payloads de pagamento.
9. **Segredos só em variáveis de ambiente do servidor.** Nenhuma chave de serviço no código, no repositório ou no bundle do navegador. Só variáveis com prefixo `NEXT_PUBLIC_` chegam ao navegador, e nenhuma delas pode ser segredo.
10. **Migrations**: toda mudança de banco é uma migration versionada, revisável e com reversão possível. Nada de alterar o banco manualmente. Nenhuma migration destrutiva sem estar explicitamente na especificação.
11. **Comandos destrutivos só com autorização explícita da responsável no chat, um por vez.** Isso vale mesmo quando uma especificação ou auditoria mandar executá-los. Pare, explique o que será apagado e espere o "sim". A lista inclui:
    - `supabase db reset`, `supabase stop --no-backup`, `supabase db push --include-all` em banco remoto;
    - `docker volume rm`, `docker system prune`, `docker compose down -v`;
    - `DROP DATABASE`, `DROP SCHEMA`, `DROP TABLE`, `TRUNCATE`, e `DELETE`/`UPDATE` sem `WHERE`, executados à mão;
    - `git push --force`, `git reset --hard`, `git clean -fd`;
    - `rm -rf` fora de `node_modules`, `.next`, `coverage`, `test-results` e `playwright-report`.

    Antes de qualquer um deles, mesmo autorizado, faça um backup do banco local com `pnpm db:backup` e informe o caminho do arquivo gerado. A única exceção é o setup dos testes de integração, que só atua no banco de testes (`adrielli_flores_test`) e é protegido por guarda no código.

## 3. Stack aprovada

| Camada                       | Tecnologia                                                 |
| ---------------------------- | ---------------------------------------------------------- |
| App                          | Next.js (App Router) + TypeScript em modo `strict`         |
| Gerenciador de pacotes       | pnpm                                                       |
| UI                           | Tailwind CSS + shadcn/ui                                   |
| Banco                        | PostgreSQL gerenciado pelo Supabase                        |
| Acesso ao banco e migrations | Drizzle ORM + drizzle-kit                                  |
| Autenticação                 | Supabase Auth (`@supabase/ssr`), MFA por TOTP              |
| Storage                      | Supabase Storage                                           |
| Validação                    | Zod                                                        |
| E-mail transacional          | Resend                                                     |
| Monitoramento de erros       | Sentry                                                     |
| Testes                       | Vitest (unidade e integração) + Playwright (ponta a ponta) |
| Hospedagem                   | Vercel                                                     |

Use as versões estáveis atuais de cada pacote no momento da instalação e fixe-as no `pnpm-lock.yaml`. Não adicione bibliotecas fora desta lista sem registrar o motivo no PR.

## 4. Estrutura de pastas

```
src/
  app/
    (public)/            site público
    (commerce)/          materiais, carrinho, checkout, minha-conta
    admin/               painel de conteúdo e vendas
    consultorio/         painel clínico
    api/                 rotas de API (webhooks etc.)
  modules/
    identity/            usuários, papéis, sessão, guardas de acesso
    content/
    commerce/
    clinic/
    audit/
  db/
    schema/              um arquivo por schema do Postgres
    migrations/
  lib/                   utilitários sem regra de negócio
  components/ui/         componentes do design system
tests/
  unit/  integration/  e2e/
docs/specs/
```

**Fronteiras entre módulos** (verificadas por lint):

- `app/(public)` e `app/(commerce)` **não** importam `modules/clinic`.
- Módulos não importam uns aos outros, exceto `identity` e `audit`, que todos podem usar.
- Código de `modules/*/server` nunca é importado por componentes de cliente.

## 5. Banco de dados

- Schemas do Postgres por domínio: `identity`, `content`, `commerce`, `clinic`, `audit`. Não criar tabelas de aplicação no schema `public`.
- **O app acessa o banco só pelo servidor, via Drizzle.** A API de dados automática do Supabase (PostgREST) não pode expor esses schemas, e toda tabela tem Row Level Security ligada sem políticas para `anon` e `authenticated`. Isso fecha o acesso direto pelo navegador com a chave pública.
- Chaves primárias UUID. Datas em `timestamptz`; exibição em America/Sao_Paulo. Valores monetários em centavos (`integer`).
- Nada de exclusão em cascata no schema `clinic`.

## 6. Convenções

- Idioma: código, nomes de tabelas e colunas em inglês; textos de interface em português do Brasil.
- Mensagens de commit no formato Conventional Commits (`feat:`, `fix:`, `chore:`…).
- Um PR por tarefa da especificação, com: o que foi feito, como testar, critérios de aceite atendidos, desvios e perguntas.

## 7. Entrega para auditoria

Ao terminar cada épico, entregue para revisão do Tech Lead:

1. Link do PR ou o diff completo.
2. Lista dos critérios de aceite, cada um com o teste ou a verificação que o comprova.
3. Saída da execução dos testes.
4. Migrations criadas.
5. Desvios da especificação e perguntas em aberto.

O épico só é considerado concluído após a auditoria aprovar.
