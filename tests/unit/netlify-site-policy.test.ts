import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertExactSiteName,
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

  it("o endereço de staging é o alias fixo e nunca o de produção", () => {
    const productionUrl = "https://adrielli-flores.netlify.app";
    expect(publicSiteUrl({ mode: "staging", siteUrl: productionUrl })).toBe(
      STAGING_PUBLIC_URL,
    );
    expect(publicSiteUrl({ mode: "staging", siteUrl: productionUrl })).not.toBe(
      productionUrl,
    );
    expect(STAGING_PUBLIC_URL).toBe("https://staging--adrielli-flores.netlify.app");
    expect(publicSiteUrl({ mode: "production", siteUrl: productionUrl })).toBe(
      productionUrl,
    );
    expect(() =>
      publicSiteUrl({ mode: "production", siteUrl: STAGING_PUBLIC_URL }),
    ).toThrow(/endereço de staging/);
  });

  it("o workflow de staging usa o alias e a URL que sai do script", () => {
    const workflow = readFileSync(".github/workflows/staging.yml", "utf8");
    const script = readFileSync("scripts/netlify-site.mjs", "utf8");
    expect(workflow).toContain("--context deploy-preview");
    expect(workflow).toContain("--alias staging");
    expect(workflow).toContain("NEXT_PUBLIC_SITE_URL: ${{ steps.site.outputs.url }}");
    expect(workflow).not.toContain("https://adrielli-flores.netlify.app");
    expect(script).toContain("publicSiteUrl");
  });
});
