import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WhatsAppButton } from "@/components/whatsapp-button";

describe("botão do WhatsApp", () => {
  it("não renderiza nada sem número", () => {
    expect(renderToStaticMarkup(createElement(WhatsAppButton, { url: null }))).toBe("");
  });

  it("usa o link informado, sem script", () => {
    const html = renderToStaticMarkup(
      createElement(WhatsAppButton, { url: "https://wa.me/5511999999999?text=Ol%C3%A1" }),
    );
    expect(html).toContain('href="https://wa.me/5511999999999?text=Ol%C3%A1"');
    expect(html).toContain('aria-label="Conversar pelo WhatsApp"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("size-12");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("M6.7 3.9c.4-.8");
    expect(html).toContain("M6 4.5A2.5 2.5 0 0 1 8.5 2h7");
  });
});
