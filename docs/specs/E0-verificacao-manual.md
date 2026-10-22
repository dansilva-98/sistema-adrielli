# Verificações manuais do E0

Automatizado quando dá. O que depende de GitHub, Vercel ou de um build quebrado de propósito fica aqui.

## A1 — Subir do zero

Siga o README. O critério passa se a home abre em `http://127.0.0.1:3000` só com esses passos.

## A5 — Módulo de servidor em componente de cliente

1. Crie `src/app/(public)/quebra.tsx`:

```tsx
"use client";

import { clinicServerModule } from "@/modules/clinic/server";

export function Quebra() {
  return <p>{clinicServerModule}</p>;
}
```

2. Importe `Quebra` em `src/app/(public)/page.tsx`.
3. Rode `pnpm build`.
4. O build deve falhar ao importar `server-only`.
5. Apague os dois arquivos alterados antes de commitar.

Há também um teste de unidade que varre `src` e falha se um arquivo `"use client"` importar `modules/*/server`, `db/client`, `env.server` ou `server-only`.

## A6 — PR com teste falhando

No GitHub, em Settings → Branches, proteja `main`:

- exigir pull request;
- exigir os checks do workflow `CI`: lint, typecheck, testes de unidade, testes de integração, build e E2E;
- não permitir push direto.

Para demonstrar, abra um PR com um teste que falha e confirme que o merge fica bloqueado.

## A7 — Staging e produção

- Push em `main` dispara `.github/workflows/staging.yml`: migration no banco de staging e `vercel deploy` (Preview). O plano Hobby não tem ambiente customizado; as variáveis desse deploy ficam no escopo Preview da Vercel.
- Produção só em `.github/workflows/production.yml`, disparo manual. O job usa o ambiente `production` e, depois das migrations, roda `vercel deploy --prod`.
- Em Settings → Environments → production, marque required reviewers. Sem essa aprovação o workflow não publica.
- Nenhuma action aplica migration de produção no push.
- `vercel.json` desliga o deploy automático da integração Git.

## A12 — Segredo fora do bundle

Depois de `pnpm build`, rode `pnpm check:bundle`. O script procura o valor de `SUPABASE_SERVICE_ROLE_KEY` em `.next/static` e falha se encontrar. O CI faz o mesmo com a chave do Supabase local.
