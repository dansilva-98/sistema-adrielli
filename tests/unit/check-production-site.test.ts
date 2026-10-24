import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  adminRedirectsToLogin,
  assessProduction,
  assessRobots,
  pageIsIndexable,
  PRODUCTION_ORIGIN,
  PUBLIC_PATHS,
} from "../../scripts/check-production-site.mjs";

const headers = {
  "content-security-policy": "default-src 'self'",
  "permissions-policy": "camera=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
};

const robots = [
  "User-Agent: *",
  "Allow: /",
  "Disallow: /admin",
  "Disallow: /consultorio",
  "Disallow: /equipe",
  "Disallow: /api",
].join("\n");

function productionSample() {
  return {
    health: { status: 200, body: { status: "ok" } },
    robots,
    pages: PUBLIC_PATHS.map((path) => ({
      path,
      status: 200,
      html: "<main>publico</main>",
      robotsHeader: "",
      headers,
    })),
    admin: { status: 307, location: `${PRODUCTION_ORIGIN}/equipe/sair` },
  };
}

describe("conferência de produção", () => {
  it("aceita o site no domínio sem www", () => {
    expect(PRODUCTION_ORIGIN).toBe("https://adrielliflores.com.br");
    expect(assessProduction(productionSample())).toEqual([]);
    expect(adminRedirectsToLogin({ status: 307, location: "/equipe/sair" })).toBe(true);
  });

  it("recusa health, robots aberto demais, noindex e admin sem redirecionamento", () => {
    const sample = productionSample();
    sample.health = { status: 500, body: { status: "error" } };
    sample.robots = "User-Agent: *\nDisallow: /\n";
    sample.pages[0] = {
      ...sample.pages[0],
      html: '<meta name="robots" content="noindex" />',
      headers: { ...headers, "strict-transport-security": "" },
    };
    sample.admin = { status: 200, location: "" };
    expect(assessProduction(sample)).toEqual([
      "health",
      "robots",
      "pagina /",
      "cabecalhos",
      "admin",
    ]);
    expect(assessRobots("User-Agent: *\nAllow: /\nDisallow: /admin\n")).toBe(false);
    expect(
      pageIsIndexable({ status: 200, html: "<p>ok</p>", robotsHeader: "noindex" }),
    ).toBe(false);
  });

  it("o workflow confere o endereço de produção depois do deploy", () => {
    const workflow = readFileSync(".github/workflows/production.yml", "utf8");
    const script = readFileSync("scripts/check-production-site.mjs", "utf8");
    const deploy = workflow.indexOf("netlify deploy --build --prod");
    const check = workflow.indexOf("node scripts/check-production-site.mjs");
    expect(deploy).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(deploy);
    expect(script).toContain(
      'export const PRODUCTION_ORIGIN = "https://adrielliflores.com.br"',
    );
    expect(workflow).toContain("NETLIFY_ENV_CONTEXTS: production");
    const staging = readFileSync(".github/workflows/staging.yml", "utf8");
    expect(staging).toContain("NETLIFY_ENV_CONTEXTS: deploy-preview,branch-deploy");
    expect(staging).not.toContain("NETLIFY_ENV_CONTEXTS: production");
  });
});
