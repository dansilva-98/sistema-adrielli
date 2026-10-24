import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertExactSiteName,
  PRODUCTION_ORIGIN,
  productionDomainUpdate,
  publicSiteUrl,
  resolveSitePlan,
  STAGING_PUBLIC_URL,
} from "../../scripts/netlify-site-policy.mjs";

describe("site da Netlify", () => {
  it("aceita só adrielli-flores", () => {
    expect(() => assertExactSiteName("adrielli-flores")).not.toThrow();
    expect(() => assertExactSiteName("adrielli-flores-h1")).toThrow(
      /não é adrielli-flores/,
    );
    expect(() => assertExactSiteName("adrielli-flores-staging")).toThrow(
      /não é adrielli-flores/,
    );
    expect(() => assertExactSiteName("landingpageadrielliflores")).toThrow(
      /outro projeto/,
    );
  });

  it("produção sem ID falha e nunca cria site", () => {
    expect(() => resolveSitePlan({ mode: "production", siteId: "" })).toThrow(
      /não procura nem cria/,
    );
    expect(() => resolveSitePlan({ mode: "production", siteId: "  " })).toThrow(
      /não procura nem cria/,
    );
    expect(resolveSitePlan({ mode: "production", siteId: "site-id" })).toEqual({
      action: "read",
      siteId: "site-id",
    });
  });

  it("o endereço de staging é o alias fixo e a produção usa PRODUCTION_ORIGIN", () => {
    const netlifyUrl = "https://adrielli-flores.netlify.app";
    expect(publicSiteUrl({ mode: "staging", siteUrl: netlifyUrl })).toBe(
      STAGING_PUBLIC_URL,
    );
    expect(publicSiteUrl({ mode: "staging", siteUrl: PRODUCTION_ORIGIN })).toBe(
      STAGING_PUBLIC_URL,
    );
    expect(publicSiteUrl({ mode: "staging", siteUrl: netlifyUrl })).not.toBe(netlifyUrl);
    expect(STAGING_PUBLIC_URL).toBe("https://staging--adrielli-flores.netlify.app");
    expect(publicSiteUrl({ mode: "production", siteUrl: netlifyUrl })).toBe(
      PRODUCTION_ORIGIN,
    );
    expect(publicSiteUrl({ mode: "production", siteUrl: STAGING_PUBLIC_URL })).toBe(
      PRODUCTION_ORIGIN,
    );
    expect(PRODUCTION_ORIGIN).toBe("https://adrielliflores.com.br");
    expect(
      productionDomainUpdate(["www.adrielliflores.com.br", "adrielliflores.com.br"]),
    ).toEqual({
      custom_domain: "adrielliflores.com.br",
      domain_aliases: ["www.adrielliflores.com.br"],
    });
  });

  it("os workflows usam a URL que sai do script", () => {
    const staging = readFileSync(".github/workflows/staging.yml", "utf8");
    const production = readFileSync(".github/workflows/production.yml", "utf8");
    const script = readFileSync("scripts/netlify-site.mjs", "utf8");
    const redirects = readFileSync("netlify.toml", "utf8");
    expect(staging).toContain("--context deploy-preview");
    expect(staging).toContain("--alias staging");
    expect(staging).toContain("NEXT_PUBLIC_SITE_URL: ${{ steps.site.outputs.url }}");
    expect(staging).not.toContain("https://adrielli-flores.netlify.app");
    expect(production).toContain("node scripts/netlify-domain.mjs");
    expect(production).toContain("NEXT_PUBLIC_SITE_URL: ${{ steps.site.outputs.url }}");
    expect(production).not.toContain("https://adrielli-flores.netlify.app");
    expect(script).toContain("publicSiteUrl");
    expect(script).not.toContain("publishedSiteUrl");
    expect(redirects).toContain('from = "https://www.adrielliflores.com.br/*"');
    expect(redirects).toContain('to = "https://adrielliflores.com.br/:splat"');
    expect(redirects).toContain("status = 301");
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("modo avançado");
    expect(readme).toContain("Não troque os servidores DNS.");
    expect(readme).toContain("75.2.60.5");
    expect(readme).toContain("`resend._domainkey`, `rsend` e `send`");
    expect(readme).toContain("CNAME de `www` para `adrielli-flores.netlify.app`");
  });
});
