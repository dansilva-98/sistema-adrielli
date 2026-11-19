export const PRIVACY_UPDATED_ON = "19 de novembro de 2026";

export const PRIVACY_PROCESSORS = [
  {
    name: "Supabase",
    notice: "Supabase: guarda o banco e os arquivos, em São Paulo.",
  },
  {
    name: "Netlify",
    notice:
      "Netlify: processa as páginas da área interna e roda a rotina de lembretes, fora do Brasil.",
  },
  {
    name: "Resend",
    notice: "Resend: envia os e-mails de lembrete e de código de login, fora do Brasil.",
  },
  {
    name: "Sentry",
    notice: "Sentry: registra erros, sem dados pessoais, fora do Brasil.",
  },
  {
    name: "GitHub",
    notice:
      "GitHub: faz a cópia de segurança e o disparo manual dos lembretes, fora do Brasil.",
  },
  {
    name: "Google Drive",
    notice:
      "Google Drive: guarda a cópia de segurança, criptografada antes de sair do sistema.",
  },
  {
    name: "Apple",
    notice:
      "Apple (iCloud): quando a profissional assina o calendário no iPhone, recebe só o nome de tratamento ou o primeiro nome, a inicial do sobrenome, a data, a hora e o local da sessão.",
  },
] as const;

export type PrivacyContent = {
  title: "Privacidade";
  responsible: string;
  contactLine: string;
  emailPending: boolean;
  contactEmail: string | null;
  noCollection: string;
  technicalLogs: string;
  accessLogs: string;
  clinicHeading: string;
  clinicDataCategories: string[];
  clinicItemsBeforeProcessors: string[];
  clinicProcessorsLead: string;
  clinicProcessors: string[];
  clinicItemsAfterProcessors: string[];
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

const CLINIC_DATA_CATEGORIES = [
  "Do paciente: nome, nome de tratamento, data de nascimento, CPF, escola, série, origem do encaminhamento, anotações e endereço.",
  "Do responsável: nome, parentesco, telefone, e-mail, CPF, se aceita receber lembrete, o vínculo com o paciente e quem é o responsável principal.",
  "Documentos anexados pela profissional: o arquivo, com nome, descrição e tipo (relatório clínico, relatório escolar, avaliação, documento pessoal ou outro).",
  "Das sessões: data, hora, modalidade (presencial ou online), situação (incluindo falta e reposição), anotações, motivo de cancelamento e se o lembrete foi enviado.",
  "Dos pacotes: quantidade de sessões, data de início, validade, valor e anotações.",
];

const CLINIC_ITEMS_BEFORE = [
  "Esses dados servem para organizar o atendimento, a agenda e os pacotes, e para enviar o lembrete da sessão a quem aceitou recebê-lo.",
  "Os dados de crianças e adolescentes são tratados no melhor interesse do paciente, com a ciência de pelo menos um dos responsáveis, registrada no termo de ciência entregue pela profissional.",
  "Quem acessa é só a equipe com acesso ao consultório — hoje, a profissional — com login e segundo fator. A abertura da ficha e o download de anexos ficam registrados, além das alterações.",
  "A profissional pode assinar a agenda no celular ou baixar o arquivo de uma sessão. Esse calendário leva só o nome de tratamento ou o primeiro nome, a inicial do sobrenome, a data, a hora e o local.",
];

const CLINIC_ITEMS_AFTER_SHARED = [
  "O lembrete por e-mail vai só para o responsável que aceitou; traz o nome de tratamento (ou o nome, se não houver nome de tratamento), a data, a hora e o local, sem dado clínico. Para parar de receber, basta pedir à profissional.",
  "A segurança inclui login com segundo fator, acesso restrito, registro da abertura da ficha e do download de anexos, e cópia de segurança diária criptografada.",
  "Os dados são guardados durante o atendimento e depois dele pelo prazo necessário para obrigações legais e para a defesa de direitos. O prazo concreto será informado a quem pedir.",
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
    clinicHeading: "Atendimento no consultório",
    clinicDataCategories: CLINIC_DATA_CATEGORIES,
    clinicItemsBeforeProcessors: CLINIC_ITEMS_BEFORE,
    clinicProcessorsLead: "Onde ficam e com quem são compartilhados:",
    clinicProcessors: PRIVACY_PROCESSORS.map((processor) => processor.notice),
    clinicItemsAfterProcessors: [
      ...CLINIC_ITEMS_AFTER_SHARED,
      emailPending
        ? "Os direitos de quem é titular estão na seção abaixo e serão exercidos pelo e-mail de contato, quando ele estiver cadastrado."
        : "Os direitos de quem é titular estão na seção abaixo e se exercem por esse e-mail de contato.",
    ],
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
