# L3 — Redesenho visual do site, da loja e do consultório (padrão "Etapas")

Pré-leitura obrigatória: `00-regras-do-projeto.md`, `E2-site-e-cms.md`, `L2-ajustes-do-site.md` e `E7-pacientes.md`.
Depende de: L2 na `main`. As telas da loja dependem do E3 (catálogo e compra) e do E4 (conta do cliente), que ainda não têm especificação.
Referência visual: tela de design "Adrielli Flores — 5 direções" (claude.ai). O link precisa ser compartilhado pela responsável antes de ser aberto por outra pessoa. A direção aprovada é o **modelo E** ("1+3 · E · Etapa em destaque com abas").

## Objetivo

Aplicar uma linguagem visual única a todo o produto, partindo da home aprovada (modelo E):

- topo com título grande e foto ao lado;
- um componente novo de **etapas**: linha dourada, marcadores e cartão de detalhe;
- o mesmo desenho reaproveitado nas outras páginas públicas, na loja, na conta do cliente e no consultório;
- versões para celular de todas as telas.

**Esta tarefa é visual.** Não muda regras de negócio, banco, permissões nem o fluxo de dados do CMS.

## Decisões (não reabrir)

- **Tokens:** usar os que já existem em `src/app/globals.css`, sem criar cor nova. A única exceção é o fundo marrom escuro `#4a3122`, que só aparece se a variante escura for adotada (fora desta tarefa).

  | Token             | Valor     | Uso no redesenho                                                                     |
  | ----------------- | --------- | ------------------------------------------------------------------------------------ |
  | `--surface`       | `#f6f0e8` | fundo geral                                                                          |
  | `--surface-muted` | `#efe6dc` | faixas de seção, fundo de imagens                                                    |
  | `--text`          | `#3a2418` | texto, rodapé escuro                                                                 |
  | `--muted`         | `#5c4334` | texto secundário                                                                     |
  | `--primary`       | `#7d5618` | botões, marcador ativo, links                                                        |
  | `--gold`          | `#b38937` | **só decoração**: linha das etapas, contorno de marcador, filete de cartão           |
  | `--gold-light`    | `#e3c88f` | anel do marcador ativo; botão sobre fundo escuro                                     |
  | `--support`       | `#1e5a38` | etapa final, estado "concluído", botão do WhatsApp na página Contato, rótulo de tema |
  | `--line`          | `#e4d8cc` | bordas                                                                               |

- **Fontes:** as que já estão no projeto (`next/font`). Newsreader nos títulos e no texto dos marcadores. Source Sans 3 no texto corrido e nos controles.
- **Logo:** só os arquivos de `public/brand/`:
  - `logo-horizontal-subtitulo.svg` no cabeçalho público;
  - `logo-horizontal-claro.svg` em fundo escuro;
  - `simbolo-claro.svg` no cabeçalho do consultório;
  - `logo-horizontal.svg` nos cabeçalhos compactos (checkout, Minha conta no celular).

  Não recriar o logo em texto nem em CSS.

- **Identidade aprovada no E0/E2:** visual editorial, sóbrio, nada infantil ou pastel. As cores do quebra-cabeça ficam só dentro do logo.
- **Número só para sequência.** Marcadores numerados aparecem apenas onde há ordem real: etapas do atendimento, da compra e do cadastro de paciente. Onde não há ordem (detalhes de um material, ficha do paciente, serviços, seções da conta), o marcador é um ponto sem número.
- **Sem animações de entrada.** A única transição é a troca de conteúdo do cartão ao mudar de aba. Ela respeita `prefers-reduced-motion`.
- **Botão flutuante do WhatsApp (L2.1)** continua igual em todas as páginas públicas.
- **Largura mínima:** 360 px no site público (regra do E0). Os protótipos de celular foram desenhados em 390 px e precisam funcionar em 360 px.

## L3.1 — Componente `StepTrack`

Criar em `src/components/step-track.tsx`. Ele é a peça central do redesenho.

### Anatomia

- **Linha:** 2 px, cor `--gold`, atrás dos marcadores. Começa no centro do primeiro e termina no último.
- **Marcadores:**
  - com número: 40 px no desktop, 36 px no celular;
  - sem número (ponto): 24 px.
- **Rótulo** abaixo de cada marcador, em Newsreader:
  - 21–24 px no desktop;
  - 14–16 px em Source Sans 3 no celular.
- **Cartão de detalhe** (variante `tabs`): fundo branco, borda `--line`, raio `--radius` e espaço interno de 24–40 px.

### Estados do marcador

| Estado                   | Fundo       | Texto/borda                                | Detalhe                                             |
| ------------------------ | ----------- | ------------------------------------------ | --------------------------------------------------- |
| Ativo / atual            | `--primary` | branco                                     | anel de 5–6 px em `--gold-light` (`box-shadow`)     |
| Inativo / futuro         | `--surface` | borda 2 px `--gold`, número em `--primary` | —                                                   |
| Concluído                | `--support` | `--support-foreground`, ícone de check     | só na variante `progress`                           |
| Estático (sem interação) | `--primary` | branco                                     | a última etapa do atendimento pode usar `--support` |

### Variantes

1. **`static`.** Só exibe, sem interação. Usado em:
   - "Como funciona a compra" no catálogo;
   - "Depois da sua mensagem" na página Contato.

   Marcação: `<ol>`.

2. **`tabs`.** Cada marcador é uma aba e o cartão abaixo mostra o conteúdo da aba ativa. Usado em:
   - "Como funciona" na home;
   - "Conheça o material";
   - lista de serviços;
   - ficha do paciente;
   - Minha conta.

   Acessibilidade obrigatória, no padrão WAI-ARIA Tabs:
   - `role="tablist"`, `role="tab"` com `aria-selected` e `aria-controls`, `role="tabpanel"` com `aria-labelledby`;
   - setas esquerda/direita, Home e End movem o foco; a ativação é automática;
   - só a aba ativa entra na ordem de Tab (`tabindex` 0/-1);
   - foco visível com contorno de 2 px em `--primary`.

3. **`progress`.** Mostra o progresso de um fluxo com estados concluído, atual e futuro, usando `<ol>` e `aria-current="step"`. O avanço é controlado pelo formulário, não pelo clique no marcador. Usado no checkout e no cadastro de paciente.
4. **Vertical.** Linha à esquerda e conteúdo à direita. Usado:
   - em "Serviços" no celular, como acordeão com `aria-expanded`;
   - sempre que houver mais de 4 itens ou rótulos longos em telas abaixo de 480 px.

### Comportamento no celular

Com até 4 itens de rótulo curto, a trilha fica horizontal. Na home, os rótulos curtos são Escuta, Avaliação, Intervenção e Evolução.

O rótulo curto é um texto fixo, separado do título completo cadastrado no CMS. Se o CMS mudar os títulos das etapas, o rótulo curto continua o mesmo. Registrar essa limitação em `PERGUNTAS.md`.

Na variante `tabs` da home, o cartão tem os links **"Anterior"** e **"Próxima etapa"**.

### Testes

- Unidade:
  - navegação por teclado (setas, Home, End);
  - `aria-selected` e `tabindex` corretos;
  - `progress` marca `aria-current` apenas na etapa atual.
- Acessibilidade: axe sem violações nas páginas que usam o componente.

## L3.2 — Cabeçalho e rodapé públicos

- **`public-header.tsx`:**
  - logo com subtítulo, altura de 56 px no desktop e 44 px no celular;
  - links Sobre, Serviços, Materiais e Contato;
  - botão primário **"Agendar avaliação"**, que abre `site.whatsappUrl`;
  - página atual com `aria-current="page"` e sublinhado de 2 px em `--gold`.
- Quando a loja estiver ativa (E3), entram "Minha conta" e "Carrinho (n)".
- No celular, o menu abre por um botão de 44 × 44 px com `aria-label="Abrir menu"`.
- **`public-footer.tsx`:**
  - fundo `--text`;
  - título "A etapa 1 começa com uma mensagem.";
  - botão em `--gold-light` "Chamar no WhatsApp";
  - Instagram;
  - logo claro;
  - link Privacidade.
- Manter o espaçamento do L2.3 e a área do botão flutuante.

## L3.3 — Páginas públicas

Todas continuam montadas a partir do CMS. Uma seção sem conteúdo não aparece, como já faz `homeSectionKeys`.

### Home `/` — modelo E

1. **Topo, em duas colunas:**
   - à esquerda: `heroTagline` em `--primary`, `heroTitle` em H1 de 80 px no desktop e 46 px no celular, `heroSubtitle`, botão "Conversar pelo WhatsApp" e o link "Como é o atendimento", que leva à âncora das etapas;
   - à direita: `heroImage` em 4:5.
2. **Faixa de formação** em `--surface-muted`: frase curta com a especialização e o atendimento em Fernandópolis-SP (`serviceAreaText`).
3. **Como funciona:** `StepTrack` na variante `tabs`, com as 4 etapas de `howItWorks` e o texto completo no cartão. O cartão tem espaço para foto (opcional; se não houver foto, o texto ocupa a largura toda).
4. **Materiais:** cartão "Em breve" (L2.2). Com o E3, vira o carrossel de 4 a 5 materiais já decidido no L2.
5. **Depoimentos e perguntas frequentes**, se houver publicados.
6. **Rodapé.**

### Sobre `/sobre`

1. Foto (`aboutImage`, 4:5) à esquerda. À direita: título "Sobre mim", a primeira frase de `aboutBody` em destaque (Newsreader, 24 px), o restante do texto e o botão "Agendar avaliação".
2. **Formação:** grade de cartões com filete superior em `--gold`, 3 colunas no desktop e 1 no celular. Duas opções:
   - **RECOMENDADO:** criar no CMS uma lista "Formação" com título e instituição;
   - **OBRIGATÓRIO nesta tarefa, se o CMS não ganhar o campo:** não exibir a seção. Não extrair os itens do texto automaticamente.
3. **Onde atua:** texto curto e link para as etapas na home. O texto também depende do CMS; sem ele, a seção não aparece.

### Serviços `/servicos`

1. Título "Como posso ajudar seu filho." e subtítulo.
2. **Lista de serviços com `StepTrack`:**
   - no desktop, variante `tabs` com pontos: rótulo = `title`; o cartão mostra `summary`, `body`, `imagePath`/`imageAlt` e o botão "Agendar avaliação";
   - no celular, variante vertical em acordeão.
3. Com mais de 4 serviços publicados, usar a variante vertical também no desktop.
4. Depoimentos (só com `consent_at`) e perguntas frequentes (`<details>`).
5. Hoje não há serviço publicado. O estado vazio continua o atual, com o CTA de contato.

### Contato `/contato`

1. Título "Vamos conversar sobre seu filho?" e botão principal em `--support`: "Agendar avaliação pelo WhatsApp".
2. Três cartões: WhatsApp, Instagram e e-mail, cada um com a ação ("Abrir conversa", "Ver perfil", "Enviar e-mail"). O cartão de uma informação não cadastrada não aparece.
3. **Endereço** (`addressText`): link "Ver no mapa" e imagem. **Sem iframe de mapa**: a CSP não permite e o L2 proíbe terceiros. Usar uma foto da fachada enviada pelo CMS ou nenhuma imagem.
4. "Depois da sua mensagem": `StepTrack` estático, com a etapa 1 marcada e o texto "Você está aqui".

## L3.4 — Loja (layouts; regras do E3/E4)

O que está aqui é **só o layout**. Preço, pagamento, estoque, entrega do arquivo e login são decisões do E3 e do E4. Elementos que dependem dessas decisões estão marcados como "depende do E3/E4" e não devem ser inventados.

- **Catálogo `/materiais`:**
  - título "Materiais para aprender junto.", subtítulo e busca;
  - "Como funciona a compra" (`StepTrack` estático, 4 etapas): Escolha o material, Informe seus dados, Pague, Baixe em Minha conta. As formas de pagamento dependem do E3;
  - filtros por tema com `aria-pressed` (os temas dependem do E3);
  - contador "N materiais";
  - grade de cartões, 3 colunas no desktop e 1 no celular: capa, tema em `--support`, nome, frase, preço e botão "Ver material".
- **Página do material `/materiais/[slug]`:**
  - trilha de navegação;
  - galeria com 1 imagem principal e miniaturas; no celular, pontos indicadores;
  - à direita: tema, nome, resumo, preço, botões "Comprar agora" e "Adicionar ao carrinho", e a lista Formato / Indicado para / Acesso;
  - "Conheça o material": `StepTrack` com pontos, nas abas O que vem, Para quem é, Como usar e Como recebo;
  - "Outros materiais do tema";
  - no celular, barra inferior fixa com o preço e "Comprar agora", respeitando `env(safe-area-inset-bottom)` e sem cobrir o botão flutuante do WhatsApp. **Decidir no E3** se o botão flutuante some nessa página.
- **Carrinho e compra:**
  - `StepTrack` na variante `progress`: Carrinho → Seus dados → Pagamento → Pronto para baixar;
  - resumo do pedido na lateral no desktop e abaixo no celular;
  - cabeçalho compacto (logo e "Continuar comprando");
  - campos, provedor e formas de pagamento: E3.
- **Minha conta:**
  - `StepTrack` com pontos nas abas Meus materiais, Pedidos e Meus dados;
  - em Meus materiais: cartões com o estado "Disponível" (botão "Baixar") ou "Aguardando pagamento" (botão desabilitado e explicação);
  - o download por link temporário segue as regras do E3/E4.

## L3.5 — Consultório (visual sobre o E7.2)

O E7.2 continua valendo integralmente: validação no servidor, máscaras, confirmação para arquivar e prevenção de duplicidade. Aqui muda só a apresentação. Desenhar primeiro para 390 px, como pede o E7.2.

- **Cabeçalho do consultório:**
  - fundo `--text`, `simbolo-claro.svg` e o título "Consultório";
  - no celular, botão de menu de 44 × 44 px;
  - no desktop, menu lateral com o logo claro e os links atuais (Dashboard, Pacientes), sem link novo.
- **Lista de pacientes:**
  - título e botão "Novo";
  - busca;
  - seletor segmentado Ativos (n) / Arquivados (n), com `aria-pressed`;
  - cada linha com nome, idade e "responsável Nome (parentesco)";
  - botões redondos de 44 × 44 px para ligar e para WhatsApp, com `aria-label` que inclui o nome do responsável.
- **Ficha:**
  - selo de situação (Ativo em `--support`);
  - nome e idade com data de nascimento;
  - `StepTrack` com pontos nas abas Dados, Responsáveis e Anexos;
  - **Dados:** CPF mascarado na exibição, lembrete de que "Observações são administrativas", botões "Editar dados" e "Arquivar";
  - **Responsáveis:** selo "Principal", "Definir como principal", "Adicionar ou ligar responsável";
  - **Anexos:** nome, categoria, data, tamanho e quem enviou; botão "Enviar arquivo"; aviso do link de 60 segundos.

  No desktop, lista e ficha ficam lado a lado, e responsáveis e anexos aparecem em tabela dentro de uma caixa com rolagem horizontal.

- **Novo paciente** (**RECOMENDADO**: cadastro em etapas na variante `progress`): Paciente → Responsável → Revisar.
  - **Um único envio ao servidor, na última etapa.** As etapas anteriores só validam no cliente para orientar quem preenche; a validação que vale continua no servidor (Zod).
  - Nada é gravado antes de "Salvar paciente".
  - O aviso de duplicidade (mesmo nome e data de nascimento) aparece na etapa Revisar, com a confirmação "Conferi e é outra pessoa" e o link para a ficha existente.
  - Se o desenvolvedor preferir manter o formulário único do E7.2, aplicar só o visual. As duas opções atendem à especificação.
- **Dados de exemplo** nas capturas de PR, nunca dados reais.

## Textos fixos novos

Todos os outros textos vêm do CMS.

| Onde                    | Texto                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cabeçalho               | Agendar avaliação                                                                                                                   |
| Rodapé                  | A etapa 1 começa com uma mensagem. / Chamar no WhatsApp                                                                             |
| Home, cartão das etapas | Etapa N de 4 / Anterior / Próxima etapa / "Toque em cada etapa para ver os detalhes."                                               |
| Serviços                | Como posso ajudar seu filho.                                                                                                        |
| Contato                 | Vamos conversar sobre seu filho? / Agendar avaliação pelo WhatsApp / Depois da sua mensagem / Você está aqui                        |
| Loja                    | Materiais para aprender junto. / Como funciona a compra / Ver material / Comprar agora / Adicionar ao carrinho / Conheça o material |

Os títulos de seção "Formação" e "Onde atua" (Sobre) e "Conheça o material" (loja) também são texto fixo.

## Pendências de conteúdo (responsável do projeto)

- [ ] Fotos: topo (vertical 4:5), Sobre (vertical) e fachada ou consultório, se houver.
- [ ] Número do WhatsApp cadastrado no CMS.
- [ ] Serviços publicados (título, resumo, texto e imagem).
- [ ] Lista de formação, se o CMS ganhar o campo.
- [ ] Perguntas frequentes e depoimentos com consentimento.
- [ ] Horário de atendimento, se for divulgado.
- [ ] Loja (E3): temas, nomes, preços, formato dos arquivos, formas de pagamento e provedor, prazo de acesso e limite de downloads.
- [ ] Confirmar a cor principal: o E0/E2 falam em "terracota", mas o site no ar e o redesenho usam o dourado-marrom `--primary` `#7d5618`.

## Fora do escopo

- Regras de negócio, banco e permissões da loja (E3, E4) e da agenda (E8).
- Novos campos no CMS. A lista "Formação" fica como RECOMENDADO, num PR separado com migration própria, se aprovado.
- Novos itens de menu no consultório.
- Variante escura das etapas (modelo D) e as outras direções descartadas da tela de design.

## Contraste medido (WCAG 2.x)

| Texto     | Fundo     | Razão    | Uso                                                        |
| --------- | --------- | -------- | ---------------------------------------------------------- |
| `#3a2418` | `#f6f0e8` | 12,83    | texto principal                                            |
| `#5c4334` | `#f6f0e8` | 8,04     | texto secundário                                           |
| `#5c4334` | `#efe6dc` | 7,38     | texto secundário em faixa                                  |
| `#7d5618` | `#f6f0e8` | 5,77     | links e números dos marcadores                             |
| `#7d5618` | `#efe6dc` | 5,29     | links em faixa                                             |
| `#ffffff` | `#7d5618` | 6,53     | botão primário                                             |
| `#1e5a38` | `#f6f0e8` | 7,20     | rótulo de tema e selo                                      |
| `#f4fff8` | `#1e5a38` | 7,96     | botão de WhatsApp na página Contato                        |
| `#3a2418` | `#e3c88f` | 8,94     | botão sobre fundo escuro                                   |
| `#b38937` | `#f6f0e8` | **2,83** | **reprovado para texto**: usar só em linha, borda e filete |

## Critérios de aceite

| #   | Critério                                                                                                                    | Como comprovar                     |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A1  | `StepTrack` nas variantes `static`, `tabs`, `progress` e vertical, com teclado e ARIA corretos                              | Testes de unidade                  |
| A2  | Home, Sobre, Serviços e Contato no layout novo, alimentados pelo CMS, sem seção vazia                                       | E2E com banco vazio e com conteúdo |
| A3  | Logo original de `public/brand/` em todos os cabeçalhos e rodapés                                                           | Revisão do diff                    |
| A4  | Nenhuma cor fora dos tokens; dourado nunca como cor de texto                                                                | Revisão do diff                    |
| A5  | Páginas públicas sem rolagem horizontal em 360 px e 1280 px; alvos de toque de pelo menos 44 px                             | E2E de layout + capturas no PR     |
| A6  | Axe sem violações em `/`, `/sobre`, `/servicos`, `/contato` e `/consultorio/pacientes`                                      | Teste automatizado                 |
| A7  | Consultório: E7.2 continua passando; o cadastro em etapas (se adotado) envia uma única vez e não grava nada antes de salvar | Testes existentes + E2E novo       |
| A8  | Nenhum script, fonte ou serviço de terceiros novo; CSP inalterada                                                           | Revisão do diff e da CSP           |
| A9  | `prefers-reduced-motion` desliga a transição do cartão                                                                      | Teste manual descrito no PR        |

## Entrega

PRs pequenos, cada um com CI verde e capturas em 360 px e 1280 px:

1. **PR L3.1:** `StepTrack` e testes.
2. **PR L3.2–L3.3:** cabeçalho, rodapé e páginas públicas.
3. **PR L3.5:** visual do consultório.
4. **Loja (L3.4):** entra junto com o E3/E4, não antes.
