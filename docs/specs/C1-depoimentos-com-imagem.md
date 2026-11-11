# C1: depoimentos com imagem

Data: 11/11/2026. Autor: Tech Lead. Status: aprovada para implementação.

## Objetivo

A responsável quer publicar depoimentos em formato de imagem, por exemplo o print de uma mensagem do WhatsApp ou do Instagram de uma família. Hoje um depoimento tem só texto (`quote`), autor (`author_label`) e data do consentimento (`consent_at`), e só pode ser publicado com o consentimento preenchido.

## Decisão

O depoimento passa a aceitar uma **imagem opcional**. O texto continua **obrigatório**: com imagem, ele é a **transcrição** do que está escrito no print.

Motivos:

- leitor de tela, busca do Google e quem tem dificuldade de leitura não leem o texto dentro da imagem;
- a transcrição serve de texto alternativo (`alt`) e de reserva se a imagem não carregar;
- as regras atuais de tamanho, consentimento e publicação continuam valendo, sem nenhum estado novo.

## Banco (OBRIGATÓRIO)

Migration nova, **só acrescenta colunas**:

```sql
alter table content.testimonials
  add column image_path varchar(<CONTENT_LIMITS.testimonialImagePath>);
alter table content.testimonials
  add constraint testimonials_image_path
  check (image_path is null or image_path ~ <siteImagePathPattern>);
```

- Usar o mesmo padrão de caminho e o mesmo limite dos serviços (`serviceImagePath`).
- Depoimentos existentes ficam com `image_path` nulo e continuam iguais.
- **Rollback:** `drop column`, que perde só as imagens de depoimento.
- Snapshot do Drizzle gerado de verdade (`db:generate --custom`). O `db:generate` seguinte não pode produzir nada.

## Painel (OBRIGATÓRIO)

- **Formulário de depoimento:** campo "Imagem (opcional)", com o mesmo componente, os mesmos formatos, o mesmo tamanho máximo e o mesmo envio (`uploadPlannedImage`) do formulário de serviço. Prévia antes de salvar e opção "Remover imagem".
- **Rótulo dinâmico do texto:** sem imagem, "Depoimento"; com imagem, "Transcrição do print (obrigatória)", com a ajuda "Escreva o que está na imagem. Esse texto é lido por quem usa leitor de tela."
- **Aviso fixo junto ao campo de imagem:** "Antes de enviar, recorte ou cubra nomes, fotos de perfil, números de telefone e qualquer dado da criança. Publique só com a autorização da família (data do consentimento)."
- **Envio e limpeza:** reaproveitar a lógica dos serviços. Quando a gravação falha depois do upload, a imagem enviada é apagada. Quando a imagem é trocada ou removida, a antiga é apagada.
- **Lista:** o rótulo da linha continua sendo o começo da transcrição, com a indicação "com imagem" quando houver.

## Site (OBRIGATÓRIO)

Onde os depoimentos aparecem hoje (home e Serviços):

- **Sem imagem:** igual a hoje (`blockquote` e `figcaption`).
- **Com imagem:** `<figure>` com a imagem (`alt` = transcrição truncada em 250 caracteres, mais "…" se cortar), largura máxima de 360 px, `loading="lazy"`, cantos `rounded-lg` e borda `border-line`, sem cortar o print (`object-contain`). Abaixo, `figcaption` com o autor. A transcrição completa fica num `<details>` com o resumo "Ler a transcrição".
- **Vários depoimentos com imagem:** grade com `sm:grid-cols-2` e `lg:grid-cols-3`, alinhada pelo topo.
- **Responsividade:** sem rolagem horizontal em 320, 375, 768, 1024 e 1280 px. Imagens altas, como um print de celular, ficam limitadas a `max-h-[32rem]`.

## Segurança e privacidade

- Mesmo bucket público dos serviços (`site-public`). A imagem só aparece no site se o depoimento estiver publicado, e publicar exige o consentimento.
- **Sem leitura automática do texto da imagem:** nenhum OCR e nenhuma IA. A transcrição é escrita pela responsável.
- **Metadados:** o envio de imagens já remove o EXIF (confirmar). Se não remove, remover neste PR, porque prints do celular podem trazer localização.

## Testes (OBRIGATÓRIO)

- **Unidade:** o plano de gravação do depoimento com e sem imagem, troca e remoção; a transcrição continua obrigatória com imagem; o `alt` truncado em 250.
- **Integração:** a migration aceita nulo e rejeita um caminho fora do padrão; um depoimento antigo continua válido.
- **E2E:**
  - criar um depoimento com imagem e consentimento e publicar; a home mostra a imagem com `alt` e "Ler a transcrição";
  - trocar a imagem e remover a imagem;
  - depoimento com imagem e sem consentimento: o painel não deixa publicar (regra atual);
  - axe na home com um depoimento com imagem.
- **Regressão:** os E2E atuais de depoimentos continuam passando.

## Fora do escopo

- Galeria ou carrossel.
- Vídeo.
- Mais de uma imagem por depoimento.
