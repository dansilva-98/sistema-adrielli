export const PRIVACY_UPDATED_ON = "24 de outubro de 2026";

export type PrivacyContent = {
  title: "Privacidade";
  responsible: string;
  contactLine: string;
  emailPending: boolean;
  contactEmail: string | null;
  noCollection: string;
  technicalLogs: string;
  accessLogs: string;
  rightsIntro: string;
  anpd: string;
  rights: string[];
  rightsExercise: string;
  updated: string;
};

const RIGHTS = [
  "confirmação da existência de tratamento",
  "acesso aos dados",
  "correção de dados incompletos, inexatos ou desatualizados",
  "anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade",
  "portabilidade a outro fornecedor",
  "informação sobre com quem os dados são compartilhados",
  "informação sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa",
  "revogação do consentimento",
];

export function privacyContent(contactEmail: string | null | undefined): PrivacyContent {
  const email = typeof contactEmail === "string" ? contactEmail.trim() : "";
  const emailPending = email.length === 0;
  return {
    title: "Privacidade",
    responsible:
      "A responsável por este site é Adrielli Flores, neuropsicopedagoga, pessoa física.",
    contactLine: emailPending
      ? "O e-mail de contato para assuntos de dados ainda vai ser cadastrado."
      : `Para assuntos de dados pessoais, escreva para ${email}.`,
    emailPending,
    contactEmail: emailPending ? null : email,
    noCollection:
      "Este site não tem formulário e não usa cookies de rastreamento. O contato acontece por WhatsApp, Instagram ou e-mail, fora do site.",
    technicalLogs:
      "Existem registros técnicos de erro, feitos pelo Sentry, sem dados pessoais. Cookies técnicos existem só na área da equipe, para manter a sessão de quem trabalha no painel.",
    accessLogs:
      "A Netlify, que entrega o site, e a Supabase, que guarda o acesso da equipe, registram o endereço IP, a data e a hora e o navegador de quem acessa. Esses servidores podem ficar fora do Brasil. Na área da equipe, o endereço IP também é usado para limitar tentativas de login.",
    rightsIntro:
      "A Lei Geral de Proteção de Dados garante à pessoa titular estes direitos:",
    rights: RIGHTS,
    anpd: "A pessoa titular também pode peticionar à Autoridade Nacional de Proteção de Dados (ANPD).",
    rightsExercise: emailPending
      ? "Esses direitos serão exercidos pelo e-mail de contato, quando ele estiver cadastrado."
      : "Esses direitos são exercidos por esse e-mail de contato.",
    updated: `Última atualização: ${PRIVACY_UPDATED_ON}.`,
  };
}
