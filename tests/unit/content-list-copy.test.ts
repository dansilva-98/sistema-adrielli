import { describe, expect, it } from "vitest";

import {
  addAnotherContentLabel,
  addContentLabel,
  BACK_TO_LIST_LABEL,
  contentCreatedNotice,
  contentCreatedPath,
  contentEditTitle,
  contentListPreview,
  createdNoticeFromSearch,
  HIDDEN_ON_SITE_STATUS,
  PUBLISH_ON_SITE_LABEL,
  testimonialListLabel,
} from "@/modules/content/list-copy";

describe("rótulos da lista de conteúdo", () => {
  it("usa Adicionar na lista vazia ou com itens", () => {
    expect(addContentLabel("service")).toBe("Adicionar serviço");
    expect(addContentLabel("testimonial")).toBe("Adicionar depoimento");
    expect(addContentLabel("faq")).toBe("Adicionar pergunta");
  });

  it("avisa a criação na lista e não na edição", () => {
    expect(contentCreatedNotice("service")).toBe("Serviço criado.");
    expect(contentCreatedNotice("testimonial")).toBe("Depoimento criado.");
    expect(contentCreatedNotice("faq")).toBe("Pergunta criada.");
    expect(contentCreatedPath("/admin/conteudo/servicos")).toBe(
      "/admin/conteudo/servicos?criado=1",
    );
    expect(createdNoticeFromSearch("service", "1")).toBe("Serviço criado.");
    expect(createdNoticeFromSearch("service", undefined)).toBeUndefined();
  });

  it("título da edição e links do formulário", () => {
    expect(contentEditTitle("service", "Avaliação")).toBe("Editar serviço: Avaliação");
    expect(contentEditTitle("testimonial", "Gostei do atendimento")).toBe(
      "Editar depoimento: Gostei do atendimento",
    );
    expect(contentEditTitle("faq", "Como agendar?")).toBe(
      "Editar pergunta: Como agendar?",
    );
    expect(addAnotherContentLabel("service")).toBe("Adicionar outro serviço");
    expect(addAnotherContentLabel("testimonial")).toBe("Adicionar outro depoimento");
    expect(addAnotherContentLabel("faq")).toBe("Adicionar outra pergunta");
    expect(BACK_TO_LIST_LABEL).toBe("Voltar para a lista");
  });

  it("publicação marcada como Publicar no site e oculto fora do site", () => {
    expect(PUBLISH_ON_SITE_LABEL).toBe("Publicar no site");
    expect(HIDDEN_ON_SITE_STATUS).toBe("não aparece no site");
  });

  it("corta a citação do depoimento como na lista", () => {
    const quote = "a".repeat(90);
    expect(contentListPreview(quote)).toBe(`${"a".repeat(77)}…`);
    expect(testimonialListLabel("Gostei do atendimento", null)).toBe(
      "Gostei do atendimento",
    );
    expect(
      testimonialListLabel(
        "Gostei do atendimento",
        "11111111-1111-4111-8111-111111111111.webp",
      ),
    ).toBe("Gostei do atendimento · com imagem");
  });
});
