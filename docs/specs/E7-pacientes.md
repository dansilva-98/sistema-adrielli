# E7 — Pacientes

Pré-leitura obrigatória: `00-regras-do-projeto.md`, `01-plano-de-publicacao.md` e `E1-identidade-e-acesso.md`.
Depende de: E1 e L1 (produção no ar). Bloqueia: E8.
Requisitos da responsável em 25/10/2026.

## Objetivo

A profissional cadastra e consulta seus pacientes em `/consultorio`, com os responsáveis e os anexos de cada um. Tudo fica restrito a quem tem `CLINIC_ADMIN` ou `SUPER_ADMIN` com MFA, e cada acesso a dado sensível é auditado.

**Nenhum dado real de paciente entra em produção antes de a tarefa E7.0 (backup) estar aprovada.**

## Decisões (não reabrir)

- **Público:** principalmente crianças e adolescentes, mas também adultos.
- **Responsáveis:** **todo paciente tem pelo menos 1 responsável**, e pode ter vários. Para um adulto que cuida de si, o responsável é **o próprio paciente** (opção "o próprio paciente", que copia nome e contatos).
- **Sem exclusão definitiva** nesta etapa. Paciente é **arquivado**, e anexo vai para a lixeira (exclusão lógica). As regras de retenção e de eliminação definitiva ficam para o E12.
- **Anexos** ficam num bucket **privado**, separado do bucket público do site, e só são abertos por link assinado de curta duração, gerado no servidor depois da checagem de papel.
- **Prontuário e evolução clínica não fazem parte deste épico** (E9/E10). O campo "Observações" do cadastro é administrativo. O texto de ajuda diz isso.

## Fora do escopo

Agenda e pacotes (E8), prontuário e documentos clínicos (E9/E10), acesso do paciente ou do responsável ao sistema, importação de planilhas.

## Tarefas

### E7.0 — Backup criptografado (pré-requisito para dado real)

Conforme `01-plano-de-publicacao.md`, seção "Backup":

- workflow diário no GitHub Actions com dump do banco de produção, **incluindo o schema `auth`**, mais os arquivos do bucket privado de anexos;
- criptografado com `age` **antes** de sair do job. A chave pública fica no repositório e a privada **só com a responsável**;
- destino: o Google Drive da responsável, numa pasta própria. **Nunca** como artefato do GitHub, porque o repositório é público;
- 30 cópias diárias guardadas;
- **teste de restauração documentado** num projeto Supabase descartável, com o passo a passo no README.

Pré-requisitos da responsável, com a orientação do Tech Lead:

- gerar o par de chaves `age` e guardar a privada **fora** do computador de trabalho, por exemplo no gerenciador de senhas;
- autorizar o acesso ao Drive, pela forma que o Cursor propuser, com o menor escopo possível (só a pasta do backup).

### E7.1 — Tabelas e permissões

Schema `clinic`, com RLS ligada em todas as tabelas, sem políticas para `anon` e `authenticated`, sem `ON DELETE CASCADE` e com `GRANT` só para `app_runtime`.

`clinic.patients`

- `id` uuid, `full_name` (obrigatório), `preferred_name` (como gosta de ser chamado), `birth_date` (obrigatória), `cpf` (opcional, validado e único quando preenchido);
- `school`, `school_grade`, `referral_source` (quem encaminhou), `notes` (administrativo, até 2.000 caracteres);
- `address_text` (opcional);
- `archived_at`, `created_at`, `updated_at`, `created_by` → `identity.users`.

`clinic.guardians`

- `id`, `full_name` (obrigatório), `relationship` (mãe, pai, avó, o próprio paciente, outro);
- `phone` (obrigatório, guardado só com dígitos), `email` (opcional), `cpf` (opcional);
- `receives_reminders` (booleano, padrão `false`; o E8 usa para o lembrete por e-mail), timestamps.

`clinic.patient_guardians`

- `patient_id`, `guardian_id`, `is_primary`, PK (`patient_id`, `guardian_id`);
- **um único responsável principal** por paciente (índice único parcial);
- um responsável pode estar ligado a mais de um paciente (irmãos).

`clinic.patient_attachments`

- `id`, `patient_id`, `storage_path` (`patients/<patient_id>/<uuid>.<ext>`, com CHECK como no E2), `original_name`, `mime_type`, `size_bytes`, `sha256`;
- `category` (laudo, relatório escolar, avaliação, documento pessoal, outro), `description`;
- `uploaded_by`, `created_at`, `deleted_at`, `deleted_by`.

**Regra de banco:** um paciente não pode ficar sem responsável. A aplicação garante isso dentro da transação, e um teste de integração cobre o caso. Se for possível uma restrição adiada (`DEFERRABLE`) simples, preferir.

Busca sem acento e sem diferenciar maiúsculas por nome do paciente, nome do responsável e telefone (extensão `unaccent`, ou coluna normalizada).

**Bucket `clinic-private`:**

- privado, sem leitura pública;
- limite de 10 MB por arquivo, configurado no bucket;
- tipos aceitos: PDF, JPEG, PNG e WEBP.

**Auditoria:** acrescentar a `AUDIT_ACTIONS` e à restrição do banco:

- `clinic.patient.created`, `clinic.patient.updated`, `clinic.patient.archived`, `clinic.patient.restored`;
- `clinic.guardian.linked`, `clinic.guardian.unlinked`, `clinic.guardian.updated`;
- `clinic.attachment.uploaded`, `clinic.attachment.downloaded`, `clinic.attachment.deleted`;
- `clinic.patient.viewed`, registrado ao abrir a ficha.

O `metadata` **não** leva nome, CPF ou qualquer dado do paciente: só `entity_id`.

### E7.2 — Telas em `/consultorio/pacientes`

O uso principal é no **celular** (iPhone). Desenhar primeiro para 390 px.

- **Lista:**
  - busca, filtro ativos/arquivados e ordem alfabética;
  - mostra nome, idade calculada e responsável principal com o botão de ligar ou de WhatsApp;
  - estados de carregamento e de lista vazia.
- **Novo paciente:**
  - formulário com validação no servidor (Zod);
  - pelo menos 1 responsável no próprio formulário;
  - máscara de telefone e de CPF;
  - a data de nascimento não pode ser futura.
- **Ficha:** abas ou seções para dados, responsáveis e anexos. Editar, arquivar e restaurar, com confirmação para arquivar.
- **Responsáveis:**
  - adicionar um novo ou ligar um existente (busca);
  - definir o principal;
  - desligar, com confirmação e bloqueio se for o último.
- **Prevenção de duplicidade:** ao criar um paciente com o mesmo nome e a mesma data de nascimento de outro, avisar e pedir confirmação.

### E7.3 — Anexos

- Envio pelo navegador **direto para o Storage**, com URL de envio assinada gerada no servidor depois de `assertRole`. Assim não há o limite de corpo das funções da Netlify.
- Depois do envio, uma ação de servidor **confere** o arquivo antes de gravar o registro:
  - tipo real pelos primeiros bytes (não pela extensão);
  - tamanho;
  - SHA-256.

  Se o arquivo não passar, ele é apagado e nada é gravado.

- Imagens: remover EXIF/GPS, como no E2.
- **Abrir ou baixar:** link assinado de **60 segundos**, gerado a cada clique e auditado. Nunca expor o caminho do bucket na página.
- **Excluir:** vai para a lixeira (`deleted_at`), com confirmação. O arquivo fica no bucket até a política de retenção do E12.
- Lista de anexos com nome, categoria, data, tamanho e quem enviou.

### E7.4 — Segurança e privacidade

- Toda função de `modules/clinic` chama `assertRole(['CLINIC_ADMIN','SUPER_ADMIN'])`, além da guarda da rota. Teste de integração para cada caso:
  - sem login;
  - `CONTENT_ADMIN`;
  - sem MFA.
- Nenhum dado de paciente em logs, no Sentry (`beforeSend` já filtra; acrescentar os nomes de campo novos), em URLs ou em títulos de página.
- `Cache-Control: no-store` em todas as respostas de `/consultorio`.
- O lint de fronteiras continua impedindo `app/(public)` de importar `modules/clinic`.

## Critérios de aceite

| #   | Critério                                                                                     | Como comprovar                  |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| A1  | Backup diário criptografado chegando ao Drive, e uma restauração testada                     | Execução real + registro no PR  |
| A2  | Cadastrar, editar, arquivar e restaurar paciente, sempre com pelo menos 1 responsável        | E2E + integração                |
| A3  | Vários responsáveis, um principal, responsável compartilhado entre irmãos                    | Integração                      |
| A4  | Anexo: envia PDF e imagem, recusa tipo falso e arquivo acima de 10 MB, abre por link de 60 s | Integração + E2E                |
| A5  | Sem papel clínico ou sem MFA, nenhuma leitura ou escrita (página e função)                   | Integração + E2E                |
| A6  | Auditoria em cada ação, sem dado pessoal no `metadata`                                       | Integração                      |
| A7  | Busca sem acento por paciente, responsável e telefone                                        | Unidade + integração            |
| A8  | Telas usáveis em 390 px, e mediana de `/consultorio/pacientes` ≤ 1,5 s no staging            | E2E + "Medir staging"           |
| A9  | Nenhum dado de paciente em log, Sentry, URL ou título                                        | Revisão + teste do `beforeSend` |

## Entrega

Um PR por tarefa (E7.0 a E7.4), conforme a seção 7 das regras. Mudança em workflow (backup) só é aprovada com **execução real** registrada no PR.
