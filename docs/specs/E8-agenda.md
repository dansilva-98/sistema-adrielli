# E8 — Agenda

Pré-leitura obrigatória: `00-regras-do-projeto.md`, `01-plano-de-publicacao.md`, `E1-identidade-e-acesso.md` e `E7-pacientes.md`.
Depende de: E7 aprovado. Requisitos da responsável em 25/10/2026.

## Objetivo

A profissional marca, remarca e acompanha as sessões dos pacientes em `/consultorio/agenda`, com pacotes de sessões, faltas e reposições. O responsável recebe um lembrete por e-mail, e as sessões aparecem no calendário do iPhone dela.

## Decisões (não reabrir)

- **Só a profissional marca.** O paciente combina pelo WhatsApp. Não há agendamento online nem acesso do paciente.
- **Duração padrão: 50 minutos**, alterável por sessão.
- **Um local de atendimento** por enquanto, com endereço configurável. **Atendimento online no futuro:** o modelo de dados já guarda a modalidade (`in_person`, `online`), mas a tela desta etapa oferece só "presencial".
- **Pacotes de sessões** existem.
- **Faltas:**
  - **falta avisada** gera direito a **reposição**;
  - **falta sem aviso** conta como sessão realizada, inclusive no pacote.
- **Lembrete por e-mail** ao responsável no dia anterior, só para quem tem `receives_reminders = true` (E7).
- **Calendário do iPhone** por assinatura de calendário (ICS), que o iPhone atualiza sozinho. Detalhes na E8.5.
- **Fuso:** tudo gravado em `timestamptz` e exibido em America/Sao_Paulo. Cálculos de data com biblioteca de fuso, nunca com soma manual de horas.

## Tarefas

### E8.1 — Tabelas e regras

`clinic.settings` (linha única)

- `default_duration_minutes` (50);
- `location_name`, `location_address`;
- `reminder_send_hour` (padrão 9, horário de Brasília, no dia anterior).

`clinic.packages`

- `id`, `patient_id`, `total_sessions` (> 0), `starts_on`, `expires_on` (opcional);
- `price_cents` (opcional), `notes`, `closed_at`, timestamps.

`clinic.appointments`

- `id`, `patient_id`, `package_id` (opcional), `starts_at`, `ends_at` (CHECK `ends_at > starts_at`);
- `modality` (`in_person` | `online`), `series_id` (opcional, para sessões semanais);
- `status`: `scheduled` | `completed` | `missed_notified` | `missed_unnotified` | `cancelled` | `rescheduled`;
- `makeup_of_id`: a falta avisada que esta sessão repõe (único, então cada falta tem no máximo uma reposição);
- `rescheduled_to_id`: a nova sessão, quando esta foi remarcada;
- `notes` (administrativo);
- `reminder_sent_at`, timestamps, `created_by`.

**Sem conflito de horário garantido no banco:** restrição de exclusão (`btree_gist`) sobre `tstzrange(starts_at, ends_at)` para sessões com status `scheduled` ou `completed`. Duas abas ou dois cliques ao mesmo tempo não conseguem criar sessões sobrepostas.

**Contagem do pacote** (calculada, nunca digitada):

- `completed` e `missed_unnotified` **consomem** uma sessão;
- `missed_notified` **não consome** e gera uma reposição pendente;
- `cancelled` e `rescheduled` **não consomem**;
- não é possível ligar ao pacote mais sessões do que o total.

**Mudanças de status:**

| Situação           | Ação na tela        | Resultado                                                                       |
| ------------------ | ------------------- | ------------------------------------------------------------------------------- |
| Sessão marcada     | "Realizada"         | `completed`                                                                     |
| Sessão marcada     | "Faltou, avisou"    | `missed_notified`, com reposição pendente                                       |
| Sessão marcada     | "Faltou, sem aviso" | `missed_unnotified`                                                             |
| Sessão marcada     | "Cancelar"          | `cancelled` (com motivo)                                                        |
| Sessão marcada     | "Remarcar"          | a original vira `rescheduled` e a nova é criada, ligada por `rescheduled_to_id` |
| Reposição pendente | "Agendar reposição" | nova sessão com `makeup_of_id`                                                  |

Desfazer um status só é possível no mesmo dia, e é auditado.

**Auditoria:**

- `clinic.appointment.created`, `clinic.appointment.status_changed`, `clinic.appointment.rescheduled`, `clinic.appointment.cancelled`;
- `clinic.package.created`, `clinic.package.closed`;
- `clinic.reminder.sent`;
- `clinic.calendar_feed.rotated`.

Sem dados pessoais no `metadata`.

### E8.2 — Telas em `/consultorio/agenda`

Desenhar primeiro para o celular.

- **Visões:** **dia** (padrão), **semana** e **lista dos próximos 14 dias**, com navegação por data e um botão "hoje".
- **Nova sessão:**
  - paciente (busca), data, hora, duração (50 por padrão) e pacote (opcional, lista os ativos do paciente);
  - opção **"repetir semanalmente por N semanas"**, que cria sessões individuais com o mesmo `series_id`;
  - se algum horário da série conflitar, mostrar quais e não criar nenhuma, ou criar só as livres, com confirmação explícita.
- **Detalhe da sessão:** os botões de status da tabela acima, remarcar, observações, e o link para a ficha do paciente.
- **Na ficha do paciente (E7):**
  - aba "Sessões", com o histórico completo e o status de cada uma;
  - pacotes, com o contador "usadas X de Y" e as reposições pendentes.
- **Configurações da agenda:** duração padrão, local e horário do lembrete.

### E8.3 — Pacotes

- Criar um pacote para o paciente, ligar e desligar sessões, e encerrar o pacote.
- Ao criar sessões em série, ligá-las ao pacote até o limite.
- Aviso visual quando faltar 1 sessão no pacote.

### E8.4 — Lembrete por e-mail

- **Rotina agendada no GitHub Actions duas vezes por dia**: no horário configurado e 3 horas depois, como segurança, porque o agendamento do GitHub pode atrasar ou pular.
- Ela envia o lembrete das sessões `scheduled` do **dia seguinte** cujo par (sessão, responsável) ainda não está em `clinic.appointment_reminders`.
- **Idempotente:** grava o par na mesma transação em que envia. `reminder_sent_at` da sessão é preenchido quando todos os responsáveis que aceitaram têm o par. Nunca reenvia o par gravado.
- Envio pela **API do Resend**, com uma chave nova **só de envio** (`RESEND_API_KEY`, no ambiente `production`), remetente `nao-responda@adrielliflores.com.br`.
- **Conteúdo mínimo:**
  - nome de tratamento do paciente;
  - data e hora;
  - local;
  - o texto "Em caso de imprevisto, avise pelo WhatsApp", com o link;
  - **nada clínico**.

  Modelo revisado pela responsável.

- Um responsável ligado a vários pacientes com sessões no mesmo dia recebe um e-mail só, listando as sessões.
- **Falhas:**
  - erro de envio fica registrado sem expor o e-mail no log, e a rotina falha (o GitHub avisa);
  - a próxima execução tenta de novo.
- Limite do plano gratuito do Resend: 100 e-mails por dia. A rotina para e alerta se chegar perto.

### E8.5 — Calendário do iPhone (assinatura ICS)

- Endpoint `GET /api/consultorio/calendario/<token>.ics`. O token é aleatório, com 32 bytes ou mais, e fica **guardado só como hash**.
- Em **Configurações da agenda**:
  - botão "Gerar link do calendário", que mostra o link uma vez e um passo a passo para assinar no iPhone (Ajustes → Calendário → Contas → Adicionar conta → Outra → Calendário assinado);
  - botão **"Trocar link"**, que invalida o anterior.
- Conteúdo:
  - sessões `scheduled` dos próximos 60 dias e dos últimos 7;
  - **título só com o nome de tratamento do paciente e a inicial do sobrenome**;
  - local;
  - alarme (`VALARM`) 1 hora antes;
  - **sem** responsável, telefone, observações ou qualquer dado clínico.
- `Cache-Control: private, no-store`. Limite de requisições por token.
- O endpoint fica fora da sessão da equipe (o iPhone não faz login), por isso a segurança depende do token. Isso vai registrado como risco aceito, e o link pode ser trocado a qualquer momento.
- Alternativa manual em cada sessão: botão **"Adicionar ao calendário"**, que baixa um `.ics` só daquela sessão.
- **Atenção:** o iPhone pode ignorar alarmes de calendários assinados (opção "Remover alertas"). O passo a passo explica como manter os alertas e, se não der, o lembrete do próprio calendário do iPhone.

## Critérios de aceite

| #   | Critério                                                                                        | Como comprovar                                           |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A1  | Duas sessões sobrepostas são impossíveis, mesmo com envio simultâneo                            | Integração com concorrência                              |
| A2  | Série semanal com conflito não cria nada sem confirmação                                        | E2E                                                      |
| A3  | Contagem do pacote correta para cada status, e falta avisada gera reposição                     | Unidade + integração                                     |
| A4  | Remarcar preserva o histórico (original `rescheduled` e nova ligada)                            | Integração                                               |
| A5  | Lembrete enviado uma vez só, no dia anterior, só para quem aceitou, sem dado clínico            | Integração com envio simulado + execução real no staging |
| A6  | O link ICS funciona no iPhone, mostra só o nome e a inicial, e para de funcionar ao ser trocado | Teste manual da responsável + integração                 |
| A7  | Fuso correto (sessão às 08:00 de Brasília aparece às 08:00 no iPhone e no e-mail)               | Unidade                                                  |
| A8  | Sem papel clínico ou sem MFA, nenhuma leitura ou escrita                                        | Integração + E2E                                         |
| A9  | Visão do dia usável em 390 px, e mediana ≤ 1,5 s no staging                                     | E2E + "Medir staging"                                    |

## Entrega

Um PR por tarefa (E8.1 a E8.5), conforme a seção 7 das regras. As rotinas agendadas (E8.4) só são aprovadas com execução real registrada no PR.

## Adendo de 11/11/2026 (alinhamento com o A1, já em produção)

- **E-mail:** reaproveitar o módulo do A1 (`sendStaffEmail` / `email-transport.ts`: Resend por `fetch`, tempo limite de 10 s, transporte `memory` só fora da produção), em vez de criar outro envio. Remetente `MFA_EMAIL_FROM`, ou um `REMINDER_EMAIL_FROM` com o mesmo domínio.
- **Chave do Resend no GitHub Actions:** a rotina do E8.4 roda no GitHub Actions, não na Netlify. A `RESEND_API_KEY` precisa existir também como segredo do ambiente `production` do GitHub. A responsável do projeto cria uma chave separada, "github-lembretes", só de envio e só do domínio, para poder revogar uma sem afetar o login.
- **Cota compartilhada:** o plano gratuito do Resend (100 e-mails por dia) é dividido entre os códigos de login e os lembretes. A rotina para e alerta acima de **80 envios no dia**, somando os códigos de login do dia e os responsáveis distintos com `sent_at` do dia em `clinic.appointment_reminders`, para nunca bloquear o login.
- **Critério A8:** "sem MFA" significa sessão não confirmada, nem por TOTP conhecido nem por código de e-mail (regra do A1).

## Adendo de 18/11/2026 (rotina de lembretes roda a versão publicada)

**Problema.** O job `production` do `reminders.yml` faz checkout da `main`, mas o banco da produção só recebe migrations quando o workflow Production é publicado. Entre um merge e a publicação, o código da rotina pode depender de uma tabela ou coluna que ainda não existe na produção. Em 17/11, a limpeza do feed (PR 96) rodou contra a produção sem a `0017`/`0018` e falhou (`relation "clinic.calendar_feed_requests" does not exist`). A limpeza aguentou a falha; um envio de lembretes não aguentaria.

**Decisão.** O job `production` roda o código do **último deploy verde do workflow Production**, não a `main`.

**Tarefa (PR pequeno, só CI e teste):**

1. No `reminders.yml`, `permissions` passa a `contents: read` e `actions: read`.
2. No job `production`, antes do checkout, um passo `id: versao` descobre o SHA:
   - `gh run list --repo "$GITHUB_REPOSITORY" --workflow production.yml --branch main --event workflow_dispatch --status success --limit 1 --json headSha --jq '.[0].headSha'`, com `GH_TOKEN: ${{ github.token }}`;
   - valida que o resultado tem exatamente 40 caracteres hexadecimais (`^[0-9a-f]{40}$`); **se não tiver, o job falha** (sem voltar para a `main`);
   - escreve o SHA no log (não é segredo) e em `$GITHUB_OUTPUT`.
3. O `actions/checkout@v4` do job `production` recebe `ref: ${{ steps.versao.outputs.sha }}`, mantendo `persist-credentials: false`.
4. O arquivo do workflow continua vindo da `main` (é assim que o GitHub funciona); só o código do script e as dependências vêm do SHA publicado. Os passos depois do checkout não podem depender de arquivo que só existe na `main`.
5. O job `staging` **não muda**: o staging é publicado a cada push na `main`.
6. `PERGUNTAS.md`: "a rotina de lembretes da produção usa o SHA do último Production verde; um PR que mude os lembretes só vale na produção depois de publicado".

**Testes:**

- teste de texto em `tests/unit/clinic-reminders.test.ts`: o job `production` tem `actions: read`, consulta `production.yml` com `--status success` e `--branch main`, valida o SHA e passa `ref: ${{ steps.versao.outputs.sha }}` ao checkout; o job `staging` não tem `ref:`;
- **execução real depois do merge:** `workflow_dispatch` com destino production; o log mostra o SHA da última publicação e o job termina verde.

## Adendo de 18/11/2026, tarde (cron na Netlify)

**Problema.** O cron do GitHub Actions no minuto 23 UTC pulou horas seguidas. A rotina precisa rodar no horário de Brasília, na versão já publicada.

**Decisão.** O cron passa para uma função agendada da Netlify. O `reminders.yml` fica só com `workflow_dispatch` (produção no SHA publicado, staging na `main`).

**Tarefa (PR de código):**

1. Núcleo compartilhado `runReminderJob` em `src/modules/clinic/reminder-job.ts`. O script do GitHub e a função da Netlify só chamam esse núcleo.
2. Prazo cooperativo na função (`deadlineMs: 23_000`, `reason: "deadline"`). Só começa um responsável novo se faltarem pelo menos 11 s (o Resend tem 10 s), então ninguém novo começa depois de 12 s do início. Um responsável em andamento nunca é interrompido. Sem `Promise.race`.
3. `netlify/functions/clinic-reminders.mts` com `schedule: "23 10-23,0 * * *"`, trava `REMINDERS_ENABLED === "true"` e `APP_ENV === "production"`, e envio ao Sentry na falha (envelope HTTP, sem `@sentry/nextjs` na função).
4. `reminders.yml` sem `schedule`.
5. `REMINDERS_ENABLED` é publicada no site da Netlify só pelo `production.yml` (`netlify-env.mjs`), a partir da variável de repositório do GitHub. Essa variável **não pode ser apagada**: sem ela o passo de variáveis do Production falha. Desligar: gravar `false` e publicar de novo, ou alterar na UI da Netlify.
6. A função usa a `RESEND_API_KEY` já cadastrada no site (a do login). A chave `github-lembretes` continua só no disparo manual do GitHub.
7. Merge e publicação no mesmo dia: entre o merge e o próximo Production não há cron.

**Testes:**

- texto da função: cron, trava, Sentry na falha, sem `@netlify/functions` nem `@sentry/node`, só `default` e `config`;
- texto do yml: sem `schedule`/`cron`, com `workflow_dispatch`, SHA publicado no job `production`, staging sem `ref:`;
- script e handler importam o mesmo `reminder-job.ts`;
- prazo: não começa responsável novo depois de 12 s; um envio de 10 s no limite permitido termina, grava o par e só então devolve `deadline`; a segunda execução não reenvia para esse responsável; sem `Promise.race`;
- trava: sem `REMINDERS_ENABLED` ou fora de produção, o job não é chamado;
- Sentry: envelope uma vez na falha, sem e-mail nem URL de banco; prazo não dispara Sentry;
- `REMINDERS_ENABLED` só no `production.yml`.
