# Perguntas

## E1

A spec de identidade foi recebida junto com o E0. Não foi implementada: o E1 declara dependência de E0 aprovado na auditoria.

## Seed

`pnpm db:seed` em `development` não insere linhas. O E0 proíbe tabela de negócio. Confirmar se o comando vazio, que só valida o ambiente, é o comportamento esperado.

## Toast

O registry atual do shadcn publica `toast` em cima de Base UI. O item `form` do mesmo registry não tem arquivos. O Form do projeto foi escrito com React Hook Form e Zod, como a spec pede. Sonner não foi mantido.

## APP_ENV no navegador

O Sentry do browser precisa do ambiente. `next.config.ts` embute `APP_ENV` como `NEXT_PUBLIC_APP_ENV`. O valor é `development`, `staging` ou `production`, não é segredo.

## CSP

`script-src` inclui `'unsafe-inline'` para o Next.js. Nonce fica para um épico futuro. Ver `docs/specs/csp.md`.

## Papéis anon e authenticated

A migration cria esses papéis se eles não existirem, para o `REVOKE` ser válido. No Supabase local eles já existem e o `CREATE` não roda.

## L1.1 — horário da rotina

A spec pede uma consulta por dia, fora do pico, e não fixa o relógio. A rotina ficou às 06:00 em America/Sao_Paulo (cron `0 9 * * *` em UTC). Confirmar se outro horário fora do pico é preferível.

## L1.1 — URLs públicas

Os nomes das variáveis de repositório são `PRODUCTION_PUBLIC_URL` e `STAGING_PUBLIC_URL`. A spec não publica os endereços. Enquanto a produção não responder em `/api/health`, a execução manual e a rotina diária falham, como a spec pede quando um health não responde. Confirmar os dois endereços antes de deixar o workflow na `main`, para o GitHub não avisar falha todo dia.

## Fora desta máquina

Docker não estava instalado, então `supabase start` não rodou aqui. Não há remoto GitHub: proteção de branch, Dependabot e os workflows de staging e produção estão no repositório e ainda não foram executados.

## L1.2 — texto de privacidade

O texto de `/privacidade` é um rascunho para a responsável revisar antes do lançamento. Não é orientação jurídica. A spec não traz nome jurídico completo, CPF, CNPJ nem endereço da controladora: a página usa a marca Adrielli Flores e o `contact_email` do CMS. Confirmar o texto e se o aviso de rascunho deve sair da página depois da aprovação.

## E7.0 — horário do backup

Aprovado: 03:15 em America/Sao_Paulo (cron `15 6 * * *`), separado da rotina das 06:00 que mantém o banco acordado.

## E7.0 — ambiente GitHub

Aprovado: ambiente `backup`, só na `main`, sem revisor obrigatório. O ambiente `production` continua com revisor e não serve para a rotina diária.

## E7.0 — dados de auth

Aprovado: o dump inclui o schema `auth` e os dados de `auth.users`, `auth.identities` e `auth.mfa_factors`. Sessões, refresh tokens e desafios de MFA ficam de fora.

## E7.0 — bucket ainda inexistente

Enquanto o dump não tiver `clinic.patient_attachments`, a ausência de `clinic-private` segue só com o banco e fica registrada no arquivo criptografado. Depois da E7.1, essa ausência falha o job.

## E7.0 — Storage público

O backup inclui `site-public` junto com `clinic-private`. A ausência de `site-public` falha o job.

## E7.0 — restauração real

Um Supabase local temporário, fora deste repositório, atende ao projeto descartável. A responsável restaura com a chave privada, pelo README, com a orientação do Tech Lead, logo depois do primeiro backup real. O resultado fica registrado no PR ou numa issue.

## E7.0 — alerta de backup parado

O workflow Banco ativo consulta a API pública do GitHub, sem segredo, e falha se a última execução bem-sucedida do backup na `main` tiver 30 horas ou mais.

## L3.3 — subtítulo de Serviços

A spec pede título "Como posso ajudar seu filho." e subtítulo, mas não define o texto do subtítulo nem um campo no painel. A página ficou só com o título até essa decisão.

## Manutenção — E2E staff-areas e Date.now no prerender

O teste `tests/e2e/staff-areas.spec.ts` (“CONTENT_ADMIN salva o topo e confirma antes de sair”) ficou instável no CI. Há avisos de `Date.now()` no prerender de `/equipe/*` (a guarda já chama `connection()`, mas o contexto ainda lê o relógio). Tratar num PR de manutenção, fora do L3.3.

## Manutenção — public-read-timeout instável

`tests/unit/public-read-timeout.test.ts` às vezes mede 1001–1034 ms contra o limite de 1000 ms. Fora do A1. Tratar num PR de manutenção.

## L3.3 — trilha vertical do Contato até 640 px

A spec manda a variante vertical abaixo de 480 px quando os rótulos são longos. Entre 480 e 639 px, porém, a coluna de cada etapa tem cerca de 106 px. Com o rótulo no mínimo da spec (Source Sans 3, 14 px), "Acompanhamento" sai da coluna, e o E2E mede isso em 480 px. Por isso a trilha do Contato fica vertical até `sm` (640 px). Se a responsável preferir manter 480 px, os rótulos dessa faixa precisam ficar menores que o mínimo da spec ou ter outro texto.

Junto com isso, o rótulo da trilha horizontal (Contato e abas da home) passou a usar Source Sans 3 de 14 a 16 px entre 640 e 1023 px, e a Newsreader de 24 px só a partir de `lg` (1024 px). Antes a serif começava em 640 px, e em 768 px "Acompanhamento" invadia a etapa vizinha.

## E8.1 — desfazer no mesmo dia e motivo do cancelamento

Aprovado em 12/11/2026: `status_changed_at` em toda mudança de status. Dá para desfazer `completed`, `missed_notified`, `missed_unnotified` e `cancelled` de volta para `scheduled` no mesmo dia em America/Sao_Paulo. Não desfaz `rescheduled` nem `missed_notified` com reposição ativa. A exclusão de horário volta a valer. Auditoria `clinic.appointment.status_changed` com `{ from, to: "scheduled", undo: true }`. `cancel_reason` opcional, no máximo 200 caracteres. Ajuda da tela (“Ex.: feriado, viagem…”) fica na E8.2. Não entra nos metadados da auditoria.

## E8.1 — ocupação do pacote inclui sessão marcada

Aprovado em 12/11/2026: `scheduled` ocupa vaga, junto com `completed` e `missed_unnotified`.

## E8.1 — remarcar copia pacote, modalidade e série

Aprovado em 12/11/2026: a nova sessão herda `package_id`, `modality`, `series_id` e `makeup_of_id`. A ocupação do pacote permanece a mesma.

## E8.1 — reposição única mesmo se a reposição for cancelada

Aprovado em 12/11/2026: índice único parcial em `makeup_of_id` ignora `cancelled` e `rescheduled`. Cancelar a reposição libera outra. Remarcar a reposição copia o vínculo e mantém uma ativa.

## E8.1 — pacote encerrado ou vencido

Aprovado em 12/11/2026: `closed_at` recusa nova sessão, reposição e desfazer que precise de vaga (`package-exhausted`). `expires_on` não bloqueia no banco; aviso só na E8.2.

## E8.1 — auditoria da agenda

Aprovado em 12/11/2026: os eventos da agenda entram no CHECK, inclusive `clinic.settings.updated` ao salvar a configuração, com `entity_id` nulo e `metadata {}`. `clinic.reminder.sent` e `clinic.calendar_feed.rotated` ficam listados, sem escritor nesta tarefa. O desfazer é o único caso com metadata além de `{}`.

## E8.1 — observações e migration

`notes` da sessão e do pacote têm no máximo 2000 caracteres, como na ficha. A migration desta branch é `0014_clinic_agenda`, gerada depois do rebase na `main` com o C1 (`0013_testimonials_image_path`).

## E8.1 — reposição herda o pacote

Aprovado em 12/11/2026: a reposição herda o `package_id` da falta avisada e ocupa a vaga. Pacote de 2 com 1 realizada e 1 falta avisada fica cheio depois da reposição; a terceira sessão é recusada.

## E8.1 — desfazer reposição cujo original já não é falta avisada

Aprovado em 12/11/2026: ao desfazer uma sessão com `makeup_of_id`, a origem é travada com `FOR UPDATE` e precisa continuar `missed_notified`. Caso contrário a operação é `undo-not-allowed`.

## E8.1 — cancel_reason ao desfazer

Aprovado em 12/11/2026: desfazer `cancelled` grava `cancel_reason = null`.

## E8.2 — só presencial nesta etapa

A decisão da spec permanece: o modelo guarda `online`, mas as telas da E8.2 só gravam `in_person`.

## E8.2 — série semanal e pacote

A série aceita 2 a 26 semanas. Campo vazio agenda só a sessão. Se algum horário conflitar, nada é gravado e a tela lista os conflitos. A confirmação “Criar só as livres” grava apenas os livres. Se o pacote não couber todas as livres, a série inteira é recusada (`package-exhausted`). Ligar só até o limite do pacote fica para a E8.3.

## E8.2 — semana, 14 dias e observações

A semana começa na segunda-feira. Os 14 dias contam a partir da data selecionada. `expires_on` não bloqueia; a tela avisa “Pacote vencido em dd/mm”. Observações da sessão são só exibição. Desfazer não aparece em `rescheduled`. A medição de staging continua em `/consultorio/pacientes`.

## L3.3 — destaque do Sobre e trilha do Contato (staging 10/11)

A primeira frase do Sobre usa `text-xl sm:text-2xl`. Se passar de 180 caracteres, aparece no tamanho do corpo, sem destaque. Na trilha estática do Contato, só a etapa 1 fica preenchida; as outras têm contorno dourado e fundo claro, na vertical e na horizontal.
