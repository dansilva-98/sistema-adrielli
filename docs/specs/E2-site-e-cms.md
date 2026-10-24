# E2 — Site público e CMS

Pré-leitura obrigatória: `00-regras-do-projeto.md` (inclusive a regra 11, sobre comandos destrutivos).
Depende de: E1 na `main` (PR 16, `a2a95a3`). Bloqueia: nada; o E3 (catálogo) preenche a seção de materiais deste épico.

## Objetivo

O site público da Adrielli Flores no ar com conteúdo real, editável pela equipe no `/admin` sem mexer em código: textos dos blocos fixos, serviços, depoimentos com consentimento, perguntas frequentes e fotos. O site não tem formulário: o contato acontece por WhatsApp, Instagram e e-mail.

## Decisões já tomadas (não reabrir)

- **Blocos fixos, sem editor livre de páginas.** Cada bloco tem um formulário próprio, com campos definidos. Não criar construtor de páginas, arrastar e soltar nem campo de HTML.
- **Publicação imediata.** Salvou, o site mostra na hora (revalidação por tag). Itens de lista têm `published` para esconder sem apagar. Não há fluxo de rascunho e aprovação.
- **Texto longo em Markdown restrito**, nunca HTML: parágrafos, negrito, itálico, listas e links. Links só `https:`, `mailto:` e `tel:`. Qualquer HTML digitado aparece como texto.
- **Quem edita:** `CONTENT_ADMIN` e `SUPER_ADMIN` (`ADMIN_ROLES`), sob o grupo CONTEÚDO do menu do `/admin`. MFA continua opcional para `CONTENT_ADMIN`.
- **Depoimento só é publicado com consentimento registrado** (`consent_at`). Sem vínculo com paciente: o texto e a identificação são digitados à mão (ex.: "Mãe do Pedro, 8 anos").
- **Imagens do site** num bucket público próprio, separado de qualquer arquivo de materiais ou do consultório.
- **CTA de agendamento** abre o WhatsApp com mensagem pronta (editável no CMS). A agenda online é do E8.
- **Materiais em destaque** ficam fora até o E3. Até lá, a home não mostra a seção e `/materiais` mostra um estado "Em breve" com o CTA de contato.
- Identidade visual aprovada no E0: terracota como cor principal, marrom escuro no texto, verde de apoio; títulos com serifa, texto e controles sem serifa; visual editorial, sóbrio, nada infantil ou pastel. Usar os tokens e componentes que já existem.

## Pré-requisitos (responsável do projeto)

Nada disso trava o desenvolvimento, que é feito contra o Supabase local com conteúdo de exemplo.

- [ ] Textos finais: frase do topo, Sobre, serviços, "Como funciona" e perguntas frequentes.
- [ ] Foto profissional para o topo e para o Sobre (boa resolução, horizontal e vertical se possível).
- [ ] Número de WhatsApp, perfil do Instagram, e-mail de contato e de suporte, e se o endereço do consultório aparece no site.
- [ ] Depoimentos com autorização por escrito de quem deu, guardada fora do sistema. Vale conferir se o código de ética da psicopedagogia traz alguma restrição ao uso de depoimentos.

## Fora do escopo

- Formulário de contato, newsletter e blog.
- Catálogo, vitrine e páginas de produto (E3).
- Agenda online (E8).
- Login de clientes (E4).
- Histórico de versões do conteúdo, agendamento de publicação e prévia antes de publicar.
- Vários idiomas.

## Fluxo de branches

- **T2.0** vai num PR pequeno direto para a `main`, como pedido na auditoria final do E1.
- Depois dele, criar `e2/site-e-cms` a partir da `main` atualizada. **T2.1 a T2.6** vão em PRs para essa branch, um por tarefa. Se um PR depender de outro ainda aberto, avisar no corpo e esperar o merge do anterior para abrir com a base certa (nada de PR empilhado em branch de tarefa).
- No fim, um PR de `e2/site-e-cms` para `main`, com a evidência de cada critério de aceite.

## Tarefas

### T2.0 — Desligar o cadastro aberto no Supabase Auth (PR para a `main`)

Herdado da auditoria final do E1.

- `supabase/config.toml`: `enable_signup = false` em `[auth]`. **Não** mexer em `[auth.email] enable_signup`: na CLI do Supabase ele liga e desliga o provedor de e-mail inteiro (`GOTRUE_EXTERNAL_EMAIL_ENABLED`), e `false` impediria o login e o convite da equipe. (Corrigido em 23/10 após o PR 17.)
- Conferir que o convite da equipe (`inviteUserByEmail`) e o `admin:bootstrap` continuam funcionando com o cadastro desligado. Os E2E de convite já cobrem isso; precisam continuar verdes.
- README: registrar que o mesmo ajuste vale no painel de staging e produção até o E4, que decide como o login do cliente vai criar contas.
- E2E novo: `/cadastro` e `/equipe/cadastro` respondem 404.
- Teste de integração: `POST /auth/v1/signup` no Supabase local, com a chave pública, é recusado.

### T2.1 — Tabelas, bucket e permissões

Tudo no schema `content`, com RLS ligada e sem políticas para `anon` e `authenticated` (padrão do E0). `app_runtime` recebe só `SELECT`, `INSERT`, `UPDATE` e `DELETE` nestas tabelas. O site lê pelo servidor, com `app_runtime`; a chave pública continua sem acesso.

`content.site_settings` — registro único

- Chave que garante uma linha só (ex.: `id smallint primary key default 1 check (id = 1)`). A migration insere essa linha com os campos vazios.
- Topo: `hero_title` (nome exibido), `hero_subtitle` (especialidade), `hero_tagline` (frase), `hero_image_path`, `hero_image_alt`.
- Sobre: `about_title`, `about_body` (Markdown), `about_image_path`, `about_image_alt`.
- Como funciona: `how_it_works` jsonb, lista de 3 a 6 etapas com `title` e `body`, validada por Zod antes de gravar. Valor inicial: as quatro etapas da arquitetura (Contato, Avaliação, Atendimento, Acompanhamento) com o texto vazio.
- Contato: `whatsapp_number` (só dígitos, com DDI, ex.: `5511999999999`), `whatsapp_message` (mensagem pronta do CTA), `instagram_handle` (sem `@`), `contact_email`, `support_email`, `address_text` (nulo = não mostrar), `service_area_text` (ex.: "Atendimento presencial em … e online").
- Busca e redes: `seo_title`, `seo_description`.
- `updated_at`, `updated_by` → `identity.users(id)`, `version integer not null default 1`.

`content.services`

- `id` uuid, `title`, `slug` único, `summary` (até 240 caracteres), `body` (Markdown), `image_path` e `image_alt` nulos, `published` boolean default `false`, `sort_order` integer, `created_at`, `updated_at`, `updated_by`, `version`.

`content.testimonials`

- `id` uuid, `quote` (até 600 caracteres), `author_label` (até 80), `consent_at` date nulo, `published` boolean default `false`, `sort_order`, `created_at`, `updated_at`, `updated_by`, `version`.
- Restrição no banco: `check (not published or consent_at is not null)`.

`content.faq`

- `id` uuid, `question` (até 200), `answer` (Markdown, até 2000), `published` boolean default `false`, `sort_order`, `created_at`, `updated_at`, `updated_by`, `version`.

Para as três listas: índice em (`published`, `sort_order`).

Bucket `site-public`

- Público para leitura, criado por migration de forma idempotente (`on conflict do nothing`), para valer igual no local, staging e produção.
- Sem política de escrita para `anon` e `authenticated`. Só o servidor grava, com a service role.
- Limite de 4 MB e tipos `image/jpeg`, `image/png` e `image/webp` configurados no próprio bucket, como segunda barreira.

Auditoria: incluir em `AUDIT_ACTIONS` (e na restrição do banco) `content.site.updated`, `content.service.created`, `content.service.updated`, `content.service.deleted`, `content.testimonial.created`, `content.testimonial.updated`, `content.testimonial.deleted`, `content.faq.created`, `content.faq.updated`, `content.faq.deleted`, `content.image.uploaded`. Gravar com `entity_type` e `entity_id`, `metadata` vazio, sempre dentro da mesma transação da alteração.

Migrations geradas pelo drizzle-kit com snapshot. Nenhuma altera ou apaga dado existente.

### T2.2 — Módulo `content`: leitura, escrita e imagens

Leitura pública (`src/modules/content/server`)

- Funções que devolvem só o que está publicado, já ordenado: configurações do site, serviços, um serviço por `slug`, depoimentos e perguntas.
- Em cache com tag (`'use cache'` + `cacheTag`) e invalidadas pela escrita. Conferir na documentação do Next 16.4 a função certa para invalidar dentro de ação de servidor (`updateTag` ou `revalidateTag`) e explicar a escolha no PR.
- **O build não pode depender do banco.** Se o banco estiver vazio ou inacessível na hora de gerar a página, o site mostra o estado vazio, não quebra. Descrever no PR como isso foi garantido.

Escrita

- Ações de servidor que chamam `requireStaff({ roles: ADMIN_ROLES })` antes de qualquer leitura do formulário.
- Validação com Zod no servidor (a do navegador é só conforto). Tamanhos máximos de cada campo iguais no Zod e no banco.
- **Conflito de edição:** o formulário envia a `version` que carregou; o `UPDATE` só acontece com `where version = $versão` e incrementa. Se ninguém for atualizado, a ação devolve "Este conteúdo foi alterado por outra pessoa. Recarregue para ver a versão atual." e nada é gravado.
- Alteração e auditoria na mesma transação; a invalidação do cache só depois do commit.
- `slug` gerado do título (sem acento, minúsculo, hífen), editável, único. Colisão devolve mensagem no campo.
- Reordenar com botões "subir" e "descer" (troca de `sort_order` entre dois itens, numa transação). Sem arrastar e soltar.

Markdown restrito

- Um único componente de renderização, usado em todo o site, com lista fechada de elementos (`p`, `strong`, `em`, `ul`, `ol`, `li`, `a`, `br`). HTML bruto não é interpretado.
- Links: só `https:`, `mailto:` e `tel:`; externos com `rel="noopener noreferrer"` e `target="_blank"`.
- Testes de unidade com tentativas de XSS: `<script>`, `<img onerror>`, `javascript:` em link, `data:` em link, HTML misturado com Markdown.

Imagens

- Upload por ação de servidor ou rota protegida, até **4 MB** (o limite de corpo de requisição da Netlify é 6 MB; o `bodySizeLimit` das ações de servidor fica em 5 MB).
- No servidor:
  - conferir o tipo pelo conteúdo do arquivo (assinatura), não pela extensão nem pelo `Content-Type` enviado;
  - **regravar a imagem** (ex.: `sharp`) em WebP, com largura máxima de 2000 px. Isso descarta os metadados EXIF, inclusive localização do GPS;
  - nome aleatório (`uuid.webp`), nunca o nome original.
- `alt` obrigatório sempre que houver imagem.
- Ao trocar ou remover uma imagem, apagar o arquivo antigo do bucket **depois** do commit. Se essa remoção falhar, registrar no Sentry e seguir; um arquivo órfão não quebra nada.
- CSP: acrescentar a origem do Storage do Supabase em `img-src`. `next/image` com `remotePatterns` restrito a esse host e ao caminho do bucket.

### T2.3 — CMS: "Editar site"

Em `/admin/conteudo/site`, grupo CONTEÚDO do menu. Uma página com um formulário independente por bloco: Topo, Sobre, Como funciona, Contato, Busca e redes. Cada formulário tem seu botão Salvar.

- Campos com rótulo, ajuda curta e contador de caracteres nos textos com limite.
- WhatsApp: aceita o número com máscara e grava só os dígitos; mostra o link que será aberto, para conferência.
- Como funciona: adicionar e remover etapas dentro do limite de 3 a 6, e reordenar.
- Imagem: prévia da atual, trocar e remover, com confirmação para remover.
- Estados: carregando, salvando (botão desabilitado), sucesso ("Salvo. O site já mostra a alteração.") e erro compreensível. Erros de validação ao lado do campo.
- Sair da página com alterações não salvas pede confirmação.

### T2.4 — CMS: Serviços, Depoimentos e Perguntas frequentes

`/admin/conteudo/servicos`, `/admin/conteudo/depoimentos` e `/admin/conteudo/perguntas`, no mesmo grupo CONTEÚDO.

- Lista com título (ou trecho), situação (Publicado / Oculto), ordem e ações: editar, publicar ou ocultar, subir, descer, excluir.
- Criar e editar em página própria (`/novo`, `/[id]`), com os mesmos padrões da T2.3.
- Excluir pede confirmação, dizendo o que será apagado. A exclusão é definitiva e grava auditoria.
- Depoimentos:
  - campo "Data do consentimento" e aviso fixo: "Publique só com autorização por escrito de quem deu o depoimento";
  - publicar sem a data mostra erro no campo, além da barreira do banco;
  - se a autorização for retirada, excluir o depoimento (não basta ocultar).
- Estado vazio de cada lista com o botão para criar o primeiro item.
- Testes da guarda: as rotas novas entram na varredura estática do E1 (A9).

### T2.5 — Site público

Páginas existentes do grupo `(public)`, hoje vazias. Funcionar bem a partir de 360 px.

Início (`/`), nesta ordem, cada seção escondida quando não tiver conteúdo:

1. **Topo:** foto, nome, especialidade, frase. CTA principal "Agendar avaliação" (WhatsApp com a mensagem pronta) e CTA secundário "Conhecer os serviços". O CTA de materiais entra no E3.
2. **Sobre (resumo):** título, começo do texto e link para `/sobre`.
3. **Serviços:** cards com título e resumo, levando para `/servicos#<slug>`.
4. **Como funciona:** etapas numeradas.
5. **Depoimentos.**
6. **Perguntas frequentes:** lista expansível acessível (`details`/`summary` ou componente equivalente com teclado).
7. **Contato:** WhatsApp, Instagram, e-mail, endereço e área de atendimento. Endereço e e-mail aparecem como texto selecionável, além do link.

Demais páginas:

- `/sobre`: texto completo e foto.
- `/servicos`: todos os serviços publicados, com texto completo e âncora por `slug`.
- `/contato`: os mesmos dados da seção Contato, com destaque para o WhatsApp.
- `/materiais`: estado "Em breve" com o CTA de contato, até o E3.

Regras:

- Sem conteúdo nenhum cadastrado, o site continua apresentável: cabeçalho, nome, CTA de contato (se houver WhatsApp) e rodapé. Nunca texto de exemplo ou depoimento inventado em staging e produção. Conteúdo de exemplo só no `db:seed` local, marcado como exemplo.
- Links do WhatsApp: `https://wa.me/<dígitos>?text=<mensagem codificada>`, `target="_blank"`, `rel="noopener noreferrer"`.
- Imagem do topo com prioridade de carregamento; demais com carregamento sob demanda.
- Cabeçalho e rodapé atuais preservados; o rodapé ganha os contatos.
- Acessibilidade: um `h1` por página, hierarquia de títulos correta, foco visível, contraste já coberto pelos testes de token do E0.

### T2.6 — Busca e indexação

- `metadata` por página: título, descrição e Open Graph, vindos de `seo_title` e `seo_description`, com o nome da página.
- `robots.txt`:
  - produção: libera o site e bloqueia `/admin`, `/consultorio`, `/equipe` e `/api`;
  - qualquer outro ambiente (`APP_ENV` diferente de produção): bloqueia tudo;
  - fora da produção, as páginas também levam `<meta name="robots" content="noindex">`.
- `sitemap.xml` só com as páginas públicas.

## Critérios de aceite

| #   | Critério                                                                                                                                                    | Como comprovar                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A1  | Cadastro aberto desligado: `/auth/v1/signup` recusa com a chave pública; `/cadastro` e `/equipe/cadastro` dão 404; o convite da equipe continua funcionando | Integração + E2E (T2.0) + E2E de convite do E1 verdes                |
| A2  | `anon` e `authenticated` não leem nem gravam `content.*`; `app_runtime` só tem os privilégios listados                                                      | Integração com os papéis no banco                                    |
| A3  | Depoimento sem `consent_at` não pode ser publicado, nem pelo formulário nem direto no banco                                                                 | Integração (constraint) + E2E (mensagem no campo)                    |
| A4  | O site público mostra só itens publicados, na ordem definida                                                                                                | Integração da leitura + E2E                                          |
| A5  | Salvar no CMS aparece no site na próxima visita, sem novo deploy                                                                                            | E2E: edita no `/admin`, abre a página pública e confere o texto novo |
| A6  | Duas edições a partir da mesma versão: a segunda é recusada com a mensagem de conflito e nada é sobrescrito                                                 | Integração com duas atualizações concorrentes                        |
| A7  | Markdown não executa HTML nem links `javascript:` ou `data:`                                                                                                | Testes de unidade da T2.2                                            |
| A8  | Upload: recusa arquivo que não é imagem (mesmo renomeado para `.jpg`) e acima de 4 MB; a imagem gravada não tem EXIF                                        | Integração com arquivos de teste, incluindo um JPEG com GPS          |
| A9  | Toda página e ação nova do CMS chama `requireStaff`; `CLINIC_ADMIN` recebe 403 e anônimo vai para o login                                                   | Varredura estática do E1 + E2E da matriz para `/admin/conteudo/*`    |
| A10 | Cada criação, alteração e exclusão grava o evento de auditoria certo, na mesma transação, com `metadata` vazio                                              | Integração                                                           |
| A11 | Site apresentável com o banco vazio, e o build passa sem banco                                                                                              | E2E com o banco sem conteúdo + build do CI                           |
| A12 | Fora da produção, `robots.txt` bloqueia tudo e as páginas têm `noindex`; em produção, só as áreas internas ficam bloqueadas                                 | Testes de unidade da geração do `robots` e da `metadata`             |
| A13 | Site e CMS usáveis em 360 px e 1280 px                                                                                                                      | E2E com dois viewports, conferindo conteúdo e status                 |

## Entrega para auditoria

Conforme a seção 7 das regras: PRs, evidência de cada critério acima, saída dos testes, migrations, desvios e perguntas. Os E2E conferem conteúdo e status da resposta, não só que a página abriu.
