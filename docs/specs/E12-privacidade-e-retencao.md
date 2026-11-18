# E12 (parte mínima) — Privacidade, backup e retenção

Pré-leitura obrigatória: `00-regras-do-projeto.md`, `01-plano-de-publicacao.md`, `E7-pacientes.md` e `E8-agenda.md`.
Depende de: E8 em produção. Bloqueia: E13 (go-live do consultório) e **o primeiro dado real de paciente**.
Decisões da responsável do projeto em 18/11/2026.

## Objetivo

Antes do primeiro paciente real:

- o aviso de privacidade descreve o que o consultório faz com os dados de pacientes e responsáveis;
- o backup é comprovadamente restaurável;
- toda tabela que cresce com dado pessoal tem prazo de guarda definido ou registrado como pendente.

## Situação em 18/11/2026

| Item do plano                      | Situação                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Backup criptografado diário (E7.0) | No ar, verde todos os dias. **O teste de restauração nunca foi executado** (README, "Restaurar num projeto descartável"). |
| Rotina contra a pausa do banco     | No ar (`keep-database-awake.yml`), verde.                                                                                 |
| Aviso de privacidade               | Publicado em 24/10, **só sobre o site**. Não fala de pacientes, responsáveis, anexos, lembretes, calendário nem backup.   |
| Retenção                           | Não definida. Paciente é arquivado e anexo vai para a lixeira, sem exclusão definitiva (E7).                              |
| Dados reais de pacientes           | **Ainda não há.** Só o paciente de teste.                                                                                 |

## Decisões (não reabrir)

- **Prazo de guarda dos dados de pacientes: não apagar nada até a responsável decidir**, de preferência com orientação jurídica. Esta etapa **não** cria exclusão definitiva de paciente, responsável, anexo ou sessão. O aviso de privacidade diz que os dados são guardados durante o atendimento e depois dele pelo prazo necessário para obrigações legais e para a defesa de direitos, e que o prazo será informado ao titular que pedir.
- **Sem página de termos de uso.** O site público não tem cadastro nem formulário. Fica só a página **Privacidade**, ampliada.
- **Termo de ciência dos responsáveis:** documento fora do sistema, entregue pela profissional em papel ou PDF. O rascunho é preparado pelo Tech Lead e revisado pela responsável. **Sem código.**
- O texto jurídico é **revisado pela responsável**. O Tech Lead e o Cursor não dão parecer jurídico; o PR traz o texto para revisão e só é mesclado com o "ok" dela.

## Fora do escopo

- Exclusão definitiva e anonimização de pacientes (depende do prazo).
- Registro, no sistema, de que o responsável assinou o termo de ciência (melhoria futura, se ela pedir).
- Portal do titular ou pedido de dados pelo site. Os direitos continuam sendo exercidos pelo e-mail de contato.
- Troca de hospedagem ou de região.

## Tarefas

### E12.1 — Aviso de privacidade ampliado (PR de código)

Alterar `src/modules/content/privacy.ts` e `src/app/(public)/privacidade/page.tsx`, reaproveitando a estrutura e os estilos atuais (`h2` por seção, lista para itens). Atualizar `PRIVACY_UPDATED_ON`.

Manter as seções existentes do site (o que o site não coleta, registros técnicos, registros de acesso, direitos, ANPD). Acrescentar a seção **"Atendimento no consultório"**, com estes itens, em linguagem simples:

1. **Quais dados.** Categorias tiradas **do schema real** (`clinic.patients`, `clinic.guardians`, `clinic.patient_attachments`, `clinic.appointments`, `clinic.packages`), sem inventar campo.
2. **Para quê.** Organizar o atendimento, a agenda e os pacotes, e enviar o lembrete da sessão a quem aceitou recebê-lo.
3. **Crianças e adolescentes.** Os dados são tratados no melhor interesse do paciente, com a ciência de pelo menos um dos responsáveis, registrada no termo de ciência entregue pela profissional.
4. **Quem acessa.** Só a profissional, com login e segundo fator. Cada acesso a dado de paciente fica registrado.
5. **Onde ficam e com quem são compartilhados** (operadores): Supabase (São Paulo); Netlify, Resend, Sentry e GitHub fora do Brasil; Google Drive (cópia criptografada); Apple/iCloud só com nome de tratamento, inicial, data, hora e local.
6. **Lembrete por e-mail.** Só para o responsável que aceitou; sem dado clínico.
7. **Segurança.** Login com segundo fator, acesso restrito, registro de acessos, cópia de segurança diária criptografada.
8. **Por quanto tempo.** O texto da decisão acima.
9. **Direitos.** Remeter à seção de direitos já existente e ao e-mail de contato.

**Regras:** sem promessa que o sistema não cumpre; sem nome de tabela no texto público; página estática.

**Aceite:** a responsável lê o texto no staging e dá "ok" no PR **antes** do merge.

### E12.2 — Teste de restauração do backup (sem código novo)

Obrigatório **antes do primeiro paciente real**. A responsável executa o roteiro do README. O Cursor não vê a chave privada nem o conteúdo descriptografado.

### E12.3 — Prazo das tabelas técnicas (PR de código)

| Tabela                                | Hoje                          | Proposta                                        |
| ------------------------------------- | ----------------------------- | ----------------------------------------------- |
| `clinic.calendar_feed_requests`       | Limpa depois de 1 dia (PR 96) | Manter                                          |
| `identity.login_attempts`             | **Sem limpeza**               | Apagar depois de 30 dias                        |
| `identity.staff_email_mfa_challenges` | **Sem limpeza**               | Apagar depois de 1 dia, se já usado ou expirado |
| `audit.audit_log`                     | Sem limpeza                   | **Manter tudo**                                 |
| `clinic.appointment_reminders`        | Sem limpeza                   | **Manter**                                      |

Migration nova, só acrescentando: `GRANT DELETE` ao `app_runtime` **só** nessas duas tabelas, com política RLS que permite apagar só as linhas antigas (mesmo padrão da `0018`). A política irrestrita de DELETE dos desafios (0011) é substituída pela restrita, senão o `app_runtime` continuaria apagando linha nova. A limpeza roda no job de lembretes depois da do calendário.

### E12.4 — Termo de ciência (documento, sem código)

O Tech Lead prepara o rascunho. Sem código nesta etapa.

## Critérios de aceite

| #   | Critério                                                                                                   | Como comprovar                              |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| A1  | O aviso cobre pacientes, responsáveis, anexos, lembretes, calendário e backup, sem citar serviço não usado | Unidade + leitura da responsável no staging |
| A2  | `/privacidade` acessível e legível em 390 e 1280 px                                                        | E2E com axe                                 |
| A3  | Backup restaurado com o paciente fictício e o anexo, contagens batendo                                     | Registro no README (E12.2)                  |
| A4  | `login_attempts` e `staff_email_mfa_challenges` têm limpeza, sem afetar login e limite                     | Integração                                  |
| A5  | O `app_runtime` só apaga linhas antigas dessas tabelas                                                     | Integração com `SET ROLE`                   |
| A6  | Termo de ciência revisado pela responsável                                                                 | Confirmação dela                            |

## Entrega

- E12.1 e E12.3: um PR cada, sem merge.
- E12.2: executado pela responsável, com um PR só de README no final.
- E12.4: documento do Tech Lead.

**Ordem sugerida:** E12.3 e E12.1 em paralelo; E12.2 assim que a E12.3 estiver na produção; E12.4 junto com a revisão do texto da E12.1.
