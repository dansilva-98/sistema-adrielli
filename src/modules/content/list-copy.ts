export const CONTENT_KINDS = ["service", "testimonial", "faq"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const PUBLISH_ON_SITE_LABEL = "Publicar no site";
export const HIDDEN_ON_SITE_STATUS = "não aparece no site";
export const BACK_TO_LIST_LABEL = "Voltar para a lista";
export const CREATED_QUERY = "criado";

export function addContentLabel(kind: ContentKind): string {
  switch (kind) {
    case "service":
      return "Adicionar serviço";
    case "testimonial":
      return "Adicionar depoimento";
    case "faq":
      return "Adicionar pergunta";
  }
}

export function addAnotherContentLabel(kind: ContentKind): string {
  switch (kind) {
    case "service":
      return "Adicionar outro serviço";
    case "testimonial":
      return "Adicionar outro depoimento";
    case "faq":
      return "Adicionar outra pergunta";
  }
}

export function contentCreatedNotice(kind: ContentKind): string {
  switch (kind) {
    case "service":
      return "Serviço criado.";
    case "testimonial":
      return "Depoimento criado.";
    case "faq":
      return "Pergunta criada.";
  }
}

export function contentEditTitle(kind: ContentKind, label: string): string {
  switch (kind) {
    case "service":
      return `Editar serviço: ${label}`;
    case "testimonial":
      return `Editar depoimento: ${label}`;
    case "faq":
      return `Editar pergunta: ${label}`;
  }
}

export function contentCreatedPath(listHref: string): string {
  return `${listHref}?${CREATED_QUERY}=1`;
}

export function contentListPreview(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 3)}…` : text;
}

export function testimonialListLabel(quote: string, imagePath: string | null): string {
  const preview = contentListPreview(quote);
  return imagePath ? `${preview} · com imagem` : preview;
}

export function createdNoticeFromSearch(
  kind: ContentKind,
  criado: string | undefined,
): string | undefined {
  return criado === "1" ? contentCreatedNotice(kind) : undefined;
}
