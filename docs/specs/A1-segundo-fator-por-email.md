# A1: código por e-mail como opção de segundo fator

Data: 05/11/2026. Autor: Tech Lead. Status: aprovada para implementação.

## Objetivo

Hoje, quem tem um papel que exige segundo fator (`staffRequiresMfa`) entra com a senha e o código do aplicativo autenticador (TOTP do Supabase). A responsável pediu que dê para receber o código **por e-mail**.

**Decisão (05/11):** o e-mail é uma **opção**. Na hora de confirmar o login, cada pessoa escolhe: o código do aplicativo ou um código enviado ao e-mail da conta. Quem já usa o aplicativo continua como está. O aplicativo deixa de ser obrigatório.

**Por que o código é nosso:** o Supabase não oferece o e-mail como segundo fator (os fatores são TOTP e telefone). O login por código de e-mail do Supabase é um **primeiro** fator, que dispensa a senha, então não serve. O desafio é gerado, guardado e conferido pelo próprio sistema.

## O que não muda

- A senha continua obrigatória. O código do e-mail é sempre o **segundo** passo.
- O TOTP continua funcionando como hoje (`aal2` do Supabase).
- Papéis, permissões e o cookie de sessão da equipe (`STAFF_SESSION_COOKIE`) não mudam.
- Nenhuma tabela clínica é tocada.

## Fluxo

1. A pessoa entra com e-mail e senha (`beginStaffLogin`, sem mudança).
2. Se o papel exige segundo fator e a sessão não está confirmada, ela vai para `/equipe/mfa/verificar`. **O `mfa-setup` deixa de ser obrigatório:** quem ainda não tem TOTP também vai para `/verificar`.
3. Em `/equipe/mfa/verificar`:
   - com TOTP cadastrado, a opção padrão é "Código do aplicativo", com o link "Receber código por e-mail";
   - sem TOTP, a página já mostra "Enviamos um código para a***@gmail.com" e envia o código ao abrir. Ao lado, o link "Prefiro usar um aplicativo autenticador" leva a `/equipe/mfa/configurar`.
4. Botão "Enviar código" (ou envio automático), campo de 6 dígitos com `inputmode="numeric"` e `autocomplete="one-time-code"`, botão "Confirmar", e "Reenviar código" disponível depois de 60 s, com contagem.
5. Com o código certo, a sessão fica confirmada e a pessoa vai para `staffHome(roles)`.

## Regras do código (OBRIGATÓRIO)

- **Geração:** 6 dígitos com `crypto.randomInt(0, 1_000_000)`, completados com zeros à esquerda.
- **Guarda:** só o HMAC-SHA256 do código, com segredo do servidor (`STAFF_SESSION_SECRET` ou um `MFA_EMAIL_SECRET` novo). Nunca guardar nem registrar em log o código em texto.
- **Validade:** 10 minutos.
- **Tentativas:** no máximo 5 por desafio. Na 5ª errada, o desafio é encerrado e é preciso pedir outro.
- **Vínculo:** o desafio pertence ao `user_id` **e** ao `session_id` do Supabase (claim `session_id` do token, já lido em `sessionIdFromAccessToken`). Um código pedido numa sessão não vale em outra.
- **Uso único:** a confirmação é atômica, num só `UPDATE … SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL AND attempts < 5 AND expires_at > now() RETURNING id`. Duas confirmações simultâneas: só uma passa.
- **Novo envio:** ao enviar um código novo, os desafios abertos da mesma sessão são encerrados.
- **Limites de envio:** no mínimo 60 s entre envios na mesma sessão, no máximo 5 envios por hora por usuário e no máximo 20 por hora por IP. Ao passar do limite: "Muitos pedidos de código. Tente de novo em alguns minutos." Reaproveitar a tabela de tentativas de login, se servir.
- **Comparação:** `crypto.timingSafeEqual` sobre os HMACs.
- **Mensagens:** código errado ou vencido mostra "Código inválido ou vencido." Não revelar se o problema foi o prazo, o número de tentativas ou a sessão.

## Banco

Migration nova e **não destrutiva**:

```sql
create table identity.staff_email_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.profiles(id) on delete cascade,
  session_id uuid not null,
  code_hmac text not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  ip_hash text
);
create index on identity.staff_email_mfa_challenges (user_id, created_at desc);
create index on identity.staff_email_mfa_challenges (session_id) where consumed_at is not null;
```

- Ajustar o nome da tabela de perfis à tabela real de `identity`.
- Mesmas regras de acesso das outras tabelas de `identity`: sem acesso por `anon` ou `authenticated` e RLS ligada, como no restante do esquema.
- **Limpeza:** a cada envio, apagar os desafios do usuário com `created_at` acima de 24 h.
- **Rollback:** `drop table`, sem perda de outros dados.

## Regra de acesso

- `decideStaffAccess` e `decideLogin` recebem `hasEmailVerification: boolean`. A sessão está confirmada quando `aal === "aal2"` **ou** existe um desafio consumido para o `session_id` atual e o mesmo `user_id`.
- `loadAccessContext` faz essa consulta só quando o papel exige segundo fator e `aal !== "aal2"`, como já faz com `listFactors`.
- O motivo `mfa-setup` deixa de bloquear. Os papéis que exigem segundo fator recebem `mfa-verify` enquanto a sessão não estiver confirmada.
- Ao sair, a sessão do Supabase termina, e com ela a confirmação (o `session_id` muda no próximo login).

## Envio do e-mail

- **Provedor:** Resend, pela API HTTP com `fetch`, sem dependência nova. Se a responsável preferir outro provedor com API HTTP, a interface `sendStaffEmail({ to, subject, text, html })` deve permitir trocar.
- **Remetente:** `Adrielli Flores <nao-responda@adrielliflores.com.br>`. Exige verificar o domínio no provedor (registros SPF e DKIM no DNS). Isso é feito pela responsável do projeto.
- **Segredos na Netlify** (produção e staging), definidos pela responsável do projeto: `RESEND_API_KEY` e `MFA_EMAIL_FROM`. Validar no `serverEnv`. Sem a chave, a opção de e-mail não aparece, e o TOTP continua funcionando.
- **Assunto:** "Seu código de acesso: 123456".
- **Corpo:** o código, "Vale por 10 minutos." e "Se não foi você, ignore este e-mail e troque sua senha." **Nenhum dado de paciente, nome de papel ou link.**
- **Falha do provedor:** mostrar "Não foi possível enviar o código agora. Tente de novo ou use o aplicativo." e registrar o erro sem o código e sem o e-mail completo. O envio que falhou não conta como tentativa de código.
- **Testes e desenvolvimento:** transporte `memory`, ativado só quando `NODE_ENV !== "production"` **e** `MFA_EMAIL_TRANSPORT=memory`. O servidor recusa iniciar se essa combinação aparecer em produção. Os E2E leem o código por esse transporte, nunca por uma rota pública.

## Auditoria

Registrar, com `writeStaffAudit` e sem o código:

- `mfa.email.sent`
- `mfa.email.verified`
- `mfa.email.failed` (com o número da tentativa)
- `mfa.email.locked` (5 erros)
- `mfa.email.rate_limited`

## Interface

- Usar os componentes do painel (campos, botões, avisos), sem tela nova fora do padrão.
- Mostrar o e-mail mascarado: a primeira letra, `***` e o domínio.
- **Estados:** enviando ("Enviando…" com o botão desativado), enviado, erro de envio, código inválido, bloqueado após 5 erros e limite de envios.
- Botões com alvo de 44 px. Foco no campo do código depois do envio.

## Testes (OBRIGATÓRIO)

**Unidade**

- geração (sempre 6 dígitos), HMAC e comparação;
- validade de 10 min, 5 tentativas, 60 s entre envios e 5 por hora;
- máscara do e-mail;
- `decideStaffAccess` e `decideLogin` com `aal1`, com e sem `hasEmailVerification`, e com e sem TOTP;
- o transporte `memory` é recusado em produção.

**Integração (banco)**

- consumo atômico: duas confirmações em paralelo do mesmo código e só uma passa;
- um código de outra sessão ou de outro usuário não vale;
- código vencido, bloqueado ou já usado não vale;
- um envio novo encerra o anterior;
- a limpeza de 24 h.

**Permissões**

- sessão `aal1` sem e-mail confirmado: redireciona para `/equipe/mfa/verificar` nas rotas de `/admin` e `/consultorio`;
- confirmada por e-mail: entra;
- perfil desativado: não entra, mesmo com código válido.

**E2E**

- login com senha, código por e-mail (pelo transporte `memory`) e entrada no consultório;
- um código errado 5 vezes bloqueia;
- quem tem TOTP continua entrando pelo aplicativo;
- axe na tela de verificação.

**Regressão**

- os E2E atuais de MFA (`staff-mfa.spec.ts`) continuam passando.

## Riscos (registrados)

- **A conta fica tão segura quanto o e-mail.** Com a opção ligada para todos, quem invadir o e-mail **e** souber a senha entra, mesmo que a pessoa use o aplicativo. Recomendação para a responsável: senha forte e diferente da senha do e-mail, e segundo fator também na conta de e-mail (Gmail).
- **Entrega:** e-mail pode atrasar ou cair no spam. O TOTP continua disponível como alternativa.
- **Dependência de um provedor externo:** se o Resend cair, o login por e-mail fica indisponível, mas o TOTP continua.

## Melhoria futura (fora deste escopo)

- Opção no cadastro de usuários para "exigir aplicativo" por pessoa.
- Códigos de recuperação.

## Adendo de 06/11/2026 — cadastro de TOTP só com a sessão confirmada

Com o e-mail ativo, quem entra só com a senha (sessão `aal1`) não pode cadastrar o aplicativo autenticador. Sem isso, o TOTP vira atalho: a pessoa confirma o fator na sessão ainda não verificada e sobe para `aal2`, sem passar pelo segundo fator. O mesmo vale fora do site: com a chave pública, `mfa.enroll`/`mfa.verify` na API do Supabase também sobe para `aal2`.

**(a) Porta de cadastro.** Quando o MFA por e-mail está ativo, `/equipe/mfa/configurar`, `generateTotpAction` e `confirmTotpAction` exigem sessão confirmada: `aal2` confiável (veja b) **ou** `hasConsumedEmailMfa` da sessão atual. Sem isso, redirecionam para `/equipe/mfa/verificar`. Com o e-mail desativado e sem TOTP, o primeiro cadastro na sessão `aal1` continua como hoje.

**(b) Fatores conhecidos.** Nova tabela `identity.staff_totp_factors` (`factor_id` uuid PK, `user_id` com `on delete cascade`, `enrolled_at` timestamptz default now()), gravada em `confirmTotpAction` depois do `mfa.verify`. Migration não destrutiva com backfill: `insert … select id, user_id from auth.mfa_factors where factor_type = 'totp' and status = 'verified'`. O guard só aceita `aal2` se **todos** os fatores TOTP verificados estiverem na tabela. Fator desconhecido: sessão não confirmada (`mfa-verify`) e auditoria `auth.mfa.unknown_factor` com o `factor_id`, sem outros dados.

Rollback: `drop table identity.staff_totp_factors`, sem perda de outros dados. Mesmas regras de acesso das outras tabelas de `identity`.
