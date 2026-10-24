import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  chooseDraft,
  evidenceText,
  summarize,
} from "../../scripts/measure-staging-math.mjs";

describe("medição de staging", () => {
  it("prefere o rascunho deploy-preview", () => {
    expect(
      chooseDraft([
        {
          state: "ready",
          context: "production",
          published: true,
          deploy_ssl_url: "https://prod.example",
        },
        {
          state: "ready",
          context: "deploy-preview",
          published: false,
          deploy_ssl_url: "https://draft.example",
        },
      ]),
    ).toEqual({ url: "https://draft.example", context: "deploy-preview" });
  });

  it("calcula mediana e pior caso", () => {
    expect(
      summarize([
        { ms: 10, status: 200 },
        { ms: 30, status: 200 },
        { ms: 20, status: 200 },
      ]),
    ).toEqual({ median: 20, worst: 30, statuses: [200] });
  });

  it("não coloca segredo na evidência", () => {
    const text = evidenceText({
      url: "https://draft.example",
      context: "deploy-preview",
      count: 20,
      statuses: [200],
      median: 800.4,
      worst: 1200.2,
      removed: true,
    });
    expect(text).toContain("Mediana de /admin: 800.4 ms");
    expect(text).toContain("Pior caso: 1200.2 ms");
    expect(text).toContain("Usuário de teste removido: sim");
    expect(text).not.toMatch(/postgres|Bearer|eyJ/);
  });

  it("remove o usuário no finally e o deploy usa deploy-preview", () => {
    const script = readFileSync("scripts/measure-staging.mjs", "utf8");
    const workflow = readFileSync(".github/workflows/staging.yml", "utf8");
    const measure = readFileSync(".github/workflows/measure-staging.yml", "utf8");
    const main = script.slice(script.indexOf("async function main"));
    const cleanup = main.slice(main.indexOf("finally"));
    expect(cleanup).toContain("removeUser");
    expect(workflow).toContain("--context deploy-preview");
    expect(measure).toContain("environment: staging");
    expect(measure).toContain("github.ref == 'refs/heads/main'");
  });
});
