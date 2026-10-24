import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  adminRedirectsToLogin,
  assessProduction,
  assessRobots,
  pageIsIndexable,
  productionOrigin,
  PUBLIC_PATHS,
  RETRY_LIMIT_MS,
  waitForProduction,
  wwwRedirectsToApex,
} from "../../scripts/check-production-site.mjs";

const headers = {
  "content-security-policy": "default-src 'self'",
  "permissions-policy": "camera=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
};

const origin = "https://adrielliflores.com.br";
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
    origin,
    health: { status: 200, body: { status: "ok" } },
    robots,
    pages: PUBLIC_PATHS.map((path) => ({
      path,
      status: 200,
      html: "<main>publico</main>",
      robotsHeader: "",
      headers,
    })),
    admin: { status: 307, location: `${origin}/equipe/sair` },
    www: { status: 301, location: `${origin}/` },
  };
}

describe("conferência de produção", () => {
  it("lê PRODUCTION_PUBLIC_URL e aceita o site nesse endereço", () => {
    expect(productionOrigin("  https://adrielliflores.com.br/ ")).toBe(origin);
    expect(PUBLIC_PATHS).toContain("/privacidade");
    expect(wwwRedirectsToApex({ status: 301, location: `${origin}/` }, origin)).toBe(
      true,
    );
    expect(wwwRedirectsToApex({ status: 200, location: "" }, origin)).toBe(false);
    expect(() => productionOrigin("")).toThrow(/ausente/);
    expect(() => productionOrigin("http://adrielliflores.com.br")).toThrow(/https/);
    expect(() => productionOrigin("https://user:secret@adrielliflores.com.br")).toThrow(
      /credencial/,
    );
    expect(assessProduction(productionSample())).toEqual([]);
    expect(adminRedirectsToLogin({ status: 307, location: "/equipe/sair" }, origin)).toBe(
      true,
    );
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
    expect(workflow).toContain(
      "PRODUCTION_PUBLIC_URL: ${{ vars.PRODUCTION_PUBLIC_URL }}",
    );
    expect(script).toContain("process.env.PRODUCTION_PUBLIC_URL");
    expect(script).not.toContain("https://adrielli-flores.netlify.app");
    expect(workflow).toContain("NETLIFY_ENV_CONTEXTS: production");
    const staging = readFileSync(".github/workflows/staging.yml", "utf8");
    expect(staging).toContain("NETLIFY_ENV_CONTEXTS: deploy-preview,branch-deploy");
    expect(staging).not.toContain("NETLIFY_ENV_CONTEXTS: production");
    expect(workflow).toContain("timeout-minutes: 45");
    expect(RETRY_LIMIT_MS).toBe(15 * 60 * 1000);
  });

  it("repete rede e health e não espera quando o restante falha", async () => {
    const sleeps = [];
    let clock = 0;
    let attempts = 0;
    const recovered = await waitForProduction(origin, async () => new Response(), {
      limitMs: 60_000,
      intervalMs: 30_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
        sleeps.push(ms);
      },
      collect: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("tls");
        return productionSample();
      },
    });
    expect(recovered).toEqual([]);
    expect(sleeps).toEqual([30_000]);

    const stopped = await waitForProduction(origin, async () => new Response(), {
      limitMs: 0,
      intervalMs: 30_000,
      now: () => 0,
      sleep: async () => {
        throw new Error("não deveria esperar");
      },
      collect: async () => {
        throw new Error("rede");
      },
    });
    expect(stopped).toEqual(["rede"]);

    const unhealthy = productionSample();
    unhealthy.health = { status: 503, body: null };
    let healthAttempts = 0;
    const healthSleeps = [];
    const healthRecovered = await waitForProduction(origin, async () => new Response(), {
      limitMs: 60_000,
      intervalMs: 45_000,
      now: () => healthSleeps.length * 45_000,
      sleep: async (ms) => {
        healthSleeps.push(ms);
      },
      collect: async () => {
        healthAttempts += 1;
        if (healthAttempts === 1) return unhealthy;
        return productionSample();
      },
    });
    expect(healthRecovered).toEqual([]);
    expect(healthSleeps).toEqual([45_000]);

    const contentFailure = productionSample();
    contentFailure.robots = "User-Agent: *\nDisallow: /\n";
    const immediate = await waitForProduction(origin, async () => new Response(), {
      limitMs: 60_000,
      intervalMs: 30_000,
      now: () => 0,
      sleep: async () => {
        throw new Error("não deveria esperar");
      },
      collect: async () => contentFailure,
    });
    expect(immediate).toContain("robots");
    expect(immediate).not.toContain("health");
  });
});
