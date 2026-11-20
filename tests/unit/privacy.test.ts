import { describe, expect, it } from "vitest";

import { PRIVACY_PROCESSORS, privacyContent } from "@/modules/content/privacy";

const FORBIDDEN_PROCESSORS = [
  "Vercel",
  "Cloudflare",
  "Google Analytics",
  "Twilio",
  "Mixpanel",
  "AWS",
  "Stripe",
  "Mailchimp",
];

function publicText(contactEmail: string | null): string {
  return JSON.stringify(privacyContent(contactEmail));
}

describe("página de privacidade", () => {
  it("avisa quando o e-mail do CMS ainda não existe", () => {
    for (const value of [null, undefined, "", "  "]) {
      const content = privacyContent(value);
      expect(content.emailPending).toBe(true);
      expect(content.contactEmail).toBeNull();
      expect(content.contactLine).toMatch(/ainda vai ser cadastrado/);
      expect(content.rightsExercise).toMatch(/quando ele estiver cadastrado/);
      expect(content.clinicHeading).toBe("Atendimento no consultório");
      expect(content.clinicItemsAfterProcessors.join(" ")).toMatch(
        /quando ele estiver cadastrado/,
      );
    }
  });

  it("usa o e-mail de contato do CMS sem aviso de rascunho", () => {
    const content = privacyContent("  dados@adrielli.example  ");
    expect(content.contactEmail).toBe("dados@adrielli.example");
    expect(content.contactLine).toBe(
      "Para assuntos de dados pessoais, escreva para dados@adrielli.example.",
    );
    expect(content.emailPending).toBe(false);
    expect(content.responsible).toBe(
      "A responsável por este site é Adrielli Flores, neuropsicopedagoga, pessoa física.",
    );
    expect(JSON.stringify(content)).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(JSON.stringify(content)).not.toMatch(/rascunho/);
    expect(JSON.stringify(content)).not.toMatch(/não substitui orientação jurídica/);
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
    expect(content.rights).toEqual(
      expect.arrayContaining([
        "acesso aos dados",
        "correção de dados incompletos, inexatos ou desatualizados",
        "revogação do consentimento",
      ]),
    );
    expect(content.updated).toBe("Última atualização: 19 de novembro de 2026.");
    expect(JSON.stringify(content)).not.toMatch(/Ana Aprender/);
  });

  it("descreve o atendimento no consultório com e sem e-mail de contato", () => {
    for (const email of [null, "dados@adrielli.example"]) {
      const content = privacyContent(email);
      const blob = JSON.stringify(content);
      expect(content.clinicHeading).toBe("Atendimento no consultório");
      expect(content.clinicDataCategories).toEqual([
        expect.stringMatching(/^Do paciente: nome/),
        expect.stringMatching(/^Do responsável:/),
        "Documentos anexados pela profissional: o arquivo, com nome, descrição e tipo (relatório clínico, relatório escolar, avaliação, documento pessoal ou outro).",
        expect.stringMatching(/^Das sessões:/),
        expect.stringMatching(/^Dos pacotes:/),
      ]);
      expect(content.clinicDataCategories.join(" ")).toMatch(/nome de tratamento/);
      expect(content.clinicDataCategories.join(" ")).toMatch(/falta e reposição/);
      expect(content.clinicItemsBeforeProcessors.join(" ")).toMatch(/calendário/);
      expect(content.clinicItemsBeforeProcessors.join(" ")).toMatch(
        /melhor interesse do paciente/,
      );
      expect(content.clinicItemsBeforeProcessors.join(" ")).toMatch(
        /abertura da ficha e o download de anexos/,
      );
      expect(content.clinicItemsAfterProcessors.join(" ")).toMatch(/lembrete por e-mail/);
      expect(content.clinicItemsAfterProcessors.join(" ")).toMatch(/sem dado clínico/);
      expect(content.clinicItemsAfterProcessors.join(" ")).toMatch(
        /obrigações legais e para a defesa de direitos/,
      );
      expect(content.clinicItemsAfterProcessors.join(" ")).toMatch(/seção abaixo/);
      expect(blob).not.toMatch(/clinic\.|identity\.|audit\./);
      expect(blob).not.toMatch(/exclu\w* em \d+|apag\w* em \d+/i);
      expect(blob).not.toMatch(/DATABASE_URL|SENTRY_DSN|RESEND_API_KEY/);
    }
  });

  it("a lista de operadores no texto bate com PRIVACY_PROCESSORS", () => {
    const content = privacyContent("dados@adrielli.example");
    const notices = PRIVACY_PROCESSORS.map((processor) => processor.notice);
    expect(content.clinicProcessors).toEqual(notices);
    const blob = publicText("dados@adrielli.example");
    for (const processor of PRIVACY_PROCESSORS) {
      expect(blob).toContain(processor.name);
      expect(blob).toContain(processor.notice);
    }
    for (const name of FORBIDDEN_PROCESSORS) {
      expect(blob).not.toContain(name);
    }
    expect(blob).toContain(
      "GitHub: faz a cópia de segurança e o disparo manual dos lembretes, fora do Brasil.",
    );
    expect(blob).toContain(
      "Netlify: processa as páginas da área interna e roda a rotina de lembretes, fora do Brasil.",
    );
    expect(blob).not.toContain("executa as rotinas de lembrete e de backup");
  });
});
