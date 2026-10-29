import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  chooseDraft,
  CLINIC_MEDIAN_LIMIT_MS,
  evidenceText,
  medianOverLimit,
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

  it("aceita a mediana no limite e recusa acima de 1,5 s", () => {
    expect(CLINIC_MEDIAN_LIMIT_MS).toBe(1500);
    expect(medianOverLimit(1500)).toBe(false);
    expect(medianOverLimit(1500.1)).toBe(true);
    expect(medianOverLimit(1499)).toBe(false);
  });

  it("não coloca segredo na evidência", () => {
    const text = evidenceText({
      url: "https://draft.example",
      context: "deploy-preview",
      count: 20,
      adminStatuses: [200],
      adminMedian: 800.4,
      adminWorst: 1200.2,
      clinicStatuses: [200],
      clinicMedian: 900.5,
      clinicWorst: 1400.6,
      limitMs: CLINIC_MEDIAN_LIMIT_MS,
      removed: true,
    });
    expect(text).toContain("Mediana de /admin: 800.4 ms");
    expect(text).toContain("Pior caso de /admin: 1200.2 ms");
    expect(text).toContain("Mediana de /consultorio/pacientes: 900.5 ms");
    expect(text).toContain("Pior caso de /consultorio/pacientes: 1400.6 ms");
    expect(text).toContain("Limite de /consultorio/pacientes: 1500.0 ms");
    expect(text).toContain("Usuários de teste removidos: sim");
    expect(text).not.toMatch(/postgres|Bearer|eyJ/);
  });

  it("remove o usuário no finally e o deploy usa deploy-preview", () => {
    const script = readFileSync("scripts/measure-staging.mjs", "utf8");
    const workflow = readFileSync(".github/workflows/staging.yml", "utf8");
    const measure = readFileSync(".github/workflows/measure-staging.yml", "utf8");
    const main = script.slice(script.indexOf("async function main"));
    const cleanup = main.slice(main.indexOf("finally"));
    expect(cleanup).toContain("removeUser");
    expect(script).not.toMatch(/from ["']playwright["']/);
    expect(script).toContain('import.meta.resolve("@playwright/test")');
    expect(workflow).toContain("--context deploy-preview");
    expect(measure).toContain("environment: staging");
    expect(measure).toContain("github.ref == 'refs/heads/main'");
    expect(measure).toContain("Medir /admin e /consultorio autenticados");
    expect(script).toContain('provision("CLINIC_ADMIN")');
    expect(script).toContain('"/consultorio/pacientes"');
    expect(script).not.toMatch(/insert into clinic/i);
  });
});
