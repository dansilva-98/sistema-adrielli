import { describe, expect, it } from "vitest";

import { privacyContent } from "@/modules/content/privacy";

describe("página de privacidade", () => {
  it("avisa quando o e-mail do CMS ainda não existe", () => {
    for (const value of [null, undefined, "", "  "]) {
      const content = privacyContent(value);
      expect(content.emailPending).toBe(true);
      expect(content.contactEmail).toBeNull();
      expect(content.contactLine).toMatch(/ainda vai ser cadastrado/);
      expect(content.rightsExercise).toMatch(/quando ele estiver cadastrado/);
    }
  });

  it("usa o e-mail de contato do CMS e marca o texto como rascunho", () => {
    const content = privacyContent("  dados@adrielli.example  ");
    expect(content.contactEmail).toBe("dados@adrielli.example");
    expect(content.contactLine).toBe(
      "Para assuntos de dados pessoais, escreva para dados@adrielli.example.",
    );
    expect(content.emailPending).toBe(false);
    expect(content.responsible).toBe("A responsável por este site é Adrielli Flores.");
    expect(content.draftNotice).toMatch(/rascunho/);
    expect(content.draftNotice).toMatch(/não substitui orientação jurídica/);
    expect(content.noCollection).toMatch(/não tem formulário/);
    expect(content.noCollection).toMatch(/cookies de rastreamento/);
    expect(content.noCollection).toMatch(/WhatsApp, Instagram ou e-mail/);
    expect(content.technicalLogs).toMatch(/Sentry/);
    expect(content.technicalLogs).toMatch(/sem dados pessoais/);
    expect(content.technicalLogs).toMatch(/área da equipe/);
    expect(content.accessLogs).toMatch(/Netlify/);
    expect(content.accessLogs).toMatch(/Supabase/);
    expect(content.accessLogs).toMatch(/endereço IP, a data e a hora e o navegador/);
    expect(content.accessLogs).toMatch(/fora do Brasil/);
    expect(content.accessLogs).toMatch(/limitar tentativas de login/);
    expect(content.anpd).toMatch(
      /peticionar à Autoridade Nacional de Proteção de Dados \(ANPD\)/,
    );
    expect(content.draftNotice).toMatch(/rascunho/);
    expect(content.rights).toEqual(
      expect.arrayContaining([
        "acesso aos dados",
        "correção de dados incompletos, inexatos ou desatualizados",
        "revogação do consentimento",
      ]),
    );
    expect(content.updated).toBe("Última atualização: 24 de outubro de 2026.");
    expect(JSON.stringify(content)).not.toMatch(/Ana Aprender/);
  });
});
