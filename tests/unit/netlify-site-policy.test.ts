import { describe, expect, it } from "vitest";

import {
  assertExactSiteName,
  resolveSitePlan,
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
});
