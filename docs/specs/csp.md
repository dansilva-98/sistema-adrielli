# Content-Security-Policy

A política inicial é montada em `src/lib/security-headers.ts` e aplicada a todas as rotas por `headers()` em `next.config.ts`.

Diretivas fixas deste épico:

- `base-uri 'self'`
- `object-src 'none'`
- `frame-ancestors 'none'`
- `frame-src 'none'`
- `form-action 'self'`
- `default-src 'self'`

`connect-src` inclui a própria origem, a origem de `NEXT_PUBLIC_SUPABASE_URL` e as origens dos DSNs do Sentry (servidor e navegador).

`script-src` e `style-src` permitem `'unsafe-inline'` porque o Next.js injeta scripts e estilos inline. Em desenvolvimento, `script-src` também permite `'unsafe-eval'`.

## Como estender nos próximos épicos

1. Adicione a origem nova em `buildContentSecurityPolicy`, lendo a variável de ambiente correspondente. Não escreva a origem direto no componente.
2. Se a origem só existe no servidor (Resend, por exemplo), ela não entra na CSP do navegador.
3. Para retirar `'unsafe-inline'` de `script-src`, gere um nonce por requisição no proxy do Next.js e marque as páginas como dinâmicas. Isso fica para o épico que precisar de uma CSP estrita; não faça isso agora, porque impede o cache estático da home.
4. Cubra a diretiva nova no teste `tests/unit/security-headers.test.ts` e no teste E2E que lê os cabeçalhos.
