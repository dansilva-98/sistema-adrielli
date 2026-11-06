# Auditoria: PR 84 (A1, código por e-mail como segundo fator)

Data: 06/11/2026, 10h50. Head `2ecdbb6`. CI [42223673385](https://github.com/dansilva-98/sistema-adrielli/actions/runs/42223673385) **vermelho**.

## Resumo

A maior parte da especificação foi bem implementada:

- **Código:** 6 dígitos com `randomInt`, guardado só como HMAC-SHA256 e comparado com `timingSafeEqual`.
- **Limites:** validade de 10 min, 60 s entre envios, 5 envios por hora por usuário e 20 por IP.
- **Desafios:** um envio novo encerra os desafios abertos da sessão, e a limpeza de 24 h roda a cada envio.
- **Vínculo à sessão:** `user_id` e `session_id` vêm do servidor (`currentStaffAuth`), nunca do formulário.
- **Uso único:** a confirmação é um `UPDATE … WHERE consumed_at IS NULL … RETURNING`.
- **Transporte `memory`:** recusado em produção, já no `parseServerEnv`.
- **Sem vazamento do código:** o Sentry recebe só "Falha ao enviar e-mail de MFA", e não há rota pública para ler códigos.
- **Envio:** Resend por `fetch`, sem dependência nova.
- **Migration:** só acrescenta. A tabela tem RLS, `REVOKE` de `anon` e `authenticated`, FK com `on delete cascade` e os índices da especificação.
- **Auditoria:** a lista de ações foi recriada com as 5 ações novas e sem perder nenhuma das anteriores.
- **Tela:** o e-mail aparece mascarado, a escolha entre aplicativo e e-mail funciona, e o TOTP continua intacto.

## Status

**REPROVADO.** Há um problema crítico de segurança e o CI está vermelho.

## Problemas críticos

1. **Dá para pular o código do e-mail cadastrando um aplicativo novo.**
   - Com o A1, quem não tem TOTP deixa de ser obrigado a cadastrar um. Mas `/equipe/mfa/configurar` (e `generateTotpAction`/`confirmTotpAction`) continuam exigindo **só a senha** (`requireAuthSession`) para cadastrar o primeiro TOTP.
   - Quem descobrir a senha de uma conta que usa só o e-mail pode abrir `/equipe/mfa/configurar`, cadastrar o **próprio** aplicativo, chegar a `aal2` e entrar, **sem nunca ver o código do e-mail**. O segundo fator dessas contas passa a ser só a senha.
   - **Isso também funciona fora do site.** O `supabase/config.toml` tem `[auth.mfa.totp] enroll_enabled = true`. Com a chave pública do Supabase, que fica no navegador, quem tem a senha consegue fazer login e `mfa.enroll`/`mfa.verify` direto na API do Supabase e receber um token `aal2`. O guard aceita `aal2` sem perguntar de onde veio o fator.
   - **Correção, nas duas camadas:**
     - **(a) No site:** com o e-mail ativo, cadastrar TOTP exige a sessão **já confirmada** (`aal2` ou `hasConsumedEmailMfa` para o `session_id` atual). Isso vale na página `/configurar` e nas duas ações. Sem a sessão confirmada, redirecionar para `/equipe/mfa/verificar`. Com o e-mail desativado e sem TOTP, mantém-se o comportamento atual de primeiro cadastro.
     - **(b) No guard, contra o caminho pela API:** o `aal2` só vale quando **todos** os fatores TOTP verificados do usuário estão registrados pelo nosso fluxo.
       - Tabela nova `identity.staff_totp_factors` com `factor_id uuid primary key`, `user_id uuid references identity.users on delete cascade`, `enrolled_at timestamptz default now()`, RLS e grants iguais aos da tabela nova.
       - O `confirmTotpAction` grava o fator depois do `mfa.verify`.
       - A migration faz o **backfill** dos fatores verificados que já existem (`insert … select id, user_id from auth.mfa_factors where factor_type = 'totp' and status = 'verified'`). Quem já usa o aplicativo hoje continua entrando.
       - Fator verificado que não está na tabela: tratar como sessão **não confirmada** (`mfa-verify`) e registrar `auth.mfa.unknown_factor`, uma ação nova na lista da auditoria, com o `factor_id` e sem outros dados.
   - **Testes:**
     - **unidade:** `decideStaffAccess` com `aal2` e um fator desconhecido resulta em `mfa-verify`;
     - **integração:** o backfill grava os fatores existentes;
     - **permissões:** uma sessão só com senha, com o e-mail ativo, não consegue abrir `/configurar` nem chamar `generateTotpAction` (redireciona para `/verificar`);
     - **E2E:** o usuário de teste sem TOTP vai para `/verificar`, e `/configurar` o manda de volta;
     - o E2E atual de primeiro cadastro de TOTP continua passando com o e-mail desativado.

2. **CI vermelho: "Histórico do Drizzle sem divergência".** O `meta/0011_snapshot.json` é uma cópia do 0010 (só o `id` foi trocado), sem a tabela `staff_email_mfa_challenges`. O `pnpm db:generate` do CI cria uma 0012 que recriaria a tabela.
   - **Correção:** gerar o snapshot de verdade. Por exemplo: apagar o 0011 do `meta`, rodar `pnpm db:generate --custom --name staff_email_mfa`, colar o SQL atual (RLS, grants, policies e a lista da auditoria) no arquivo gerado e conferir que o `pnpm db:generate` seguinte não produz nada.
   - Fazer o mesmo com a tabela do item 1(b), na mesma migration ou numa 0012.

## Problemas importantes

3. **O limite de 5 tentativas pode ser ultrapassado com pedidos em paralelo.**
   - `confirmStaffEmailMfaCode` lê o desafio, compara o código no servidor e só depois incrementa `attempts`. Se 50 pedidos chegam ao mesmo tempo, todos leem `attempts = 0` e comparam. Um palpite certo entre eles consome o desafio, desde que seu `UPDATE` rode antes do 5º incremento. Na prática, são 50 tentativas por código, não 5.
   - **Correção:** contar a tentativa **antes** de comparar, de forma atômica: `UPDATE … SET attempts = attempts + 1 WHERE id … AND consumed_at IS NULL AND closed_at IS NULL AND attempts < 5 AND expires_at > now() RETURNING attempts, code_hmac`.
     - Sem linha retornada: "Código inválido ou vencido."
     - Com linha: comparar com o `code_hmac` retornado.
     - Código certo: consumir com `UPDATE … SET consumed_at = now() WHERE id … AND consumed_at IS NULL AND closed_at IS NULL RETURNING id`.
     - Código errado com `attempts = 5`: preencher `closed_at`.
   - **Teste de integração:** 20 confirmações em paralelo, todas erradas menos uma, com o código certo enviado por último. O total de `attempts` nunca passa de 5, e no máximo 5 comparações acontecem.

4. **Envio sem limite de tempo.** O `fetch` para o Resend não tem `signal`. Se o Resend travar, a ação do servidor fica presa até o limite da função da Netlify.
   - **Correção:** `signal: AbortSignal.timeout(10_000)`. O tempo esgotado cai no mesmo "Não foi possível enviar o código agora".
   - **Teste de unidade:** com `fetch` simulado que não responde, retorna falha em até 10 s, usando timers falsos.

## Melhorias opcionais

- **`hasVerifiedTotp`** ficou sem uso em `decideStaffAccess` (`void input.hasVerifiedTotp`) e na `SignedInAuth`. Remover o campo, ou usá-lo no item 1(b).
- **Envio automático na renderização.** `loadVerifyMfaPageData` envia o código ao renderizar `/verificar`, uma ação com efeito colateral num GET. Os limites de 60 s e 5 por hora seguram recarregamentos. Se quiser, mover o envio para uma ação chamada uma vez no `useEffect` do painel.
- **Envios simultâneos.** Dois envios ao mesmo tempo podem deixar dois desafios abertos, porque a contagem e o `insert` não são atômicos. O efeito é pequeno: vale o mais recente, e os limites seguram o resto.
- **Teste instável.** O `public-read-timeout.test.ts` está fora do escopo deste PR. Registrar no `PERGUNTAS.md`, se ainda não estiver.

## Riscos

- O item 1 é o motivo da reprovação. Sem a correção, as contas que usam só o e-mail ficam protegidas apenas pela senha.
- **Backfill (item 1b):** se a migration rodar antes de alguém terminar um cadastro de TOTP em andamento, esse fator fica fora da tabela, e a pessoa é mandada para `/verificar`, onde pode usar o e-mail. Não há perda de acesso.

## Testes faltantes

Os testes indicados nos itens 1, 3 e 4.

## Correções que o Cursor deve executar

1. Itens 1(a) e 1(b), com os testes.
2. Item 2: snapshot correto e CI verde.
3. Item 3: tentativa atômica antes da comparação.
4. Item 4: tempo limite no `fetch`.

## Critérios para nova aprovação

- CI inteiro verde.
- O teste de permissões do item 1 e o teste de concorrência do item 3 rodando no CI.
- Depois do merge: no staging, entrar com um usuário só por e-mail (o código chega pelo Resend). Confirmar que `/equipe/mfa/configurar` não abre antes do código e que um TOTP cadastrado pela API do Supabase não dá acesso.
