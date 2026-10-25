import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BACKUP_MAX_AGE_MS,
  backupIsFresh,
  backupRunsUrl,
  checkAll,
  checkBackupFreshness,
  exitCode,
  healthEndpoint,
  isHealthyResponse,
  summaryLine,
} from "../../scripts/keep-database-awake.mjs";

function jsonResponse(status: number, body: { status: string }) {
  return {
    status,
    json: async () => body,
  };
}

describe("rotina contra a pausa", () => {
  it("monta o health em https e descarta consulta e credencial", () => {
    expect(healthEndpoint("https://site.example/caminho?q=1")).toBe(
      "https://site.example/api/health",
    );
    expect(() => healthEndpoint("")).toThrow(/ausente/);
    expect(() => healthEndpoint("http://site.example")).toThrow(/https/);
    expect(() => healthEndpoint("https://user:secret@site.example")).toThrow(
      /credencial/,
    );
  });

  it("só aceita HTTP 200 com status ok", () => {
    expect(isHealthyResponse(200, { status: "ok" })).toBe(true);
    expect(isHealthyResponse(200, { status: "degraded" })).toBe(false);
    expect(isHealthyResponse(503, { status: "degraded" })).toBe(false);
    expect(isHealthyResponse(200, null)).toBe(false);
    expect(isHealthyResponse(302, { status: "ok" })).toBe(false);
  });

  it("consulta produção e staging e falha se um não responder", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("staging"))
        return jsonResponse(503, { status: "degraded" });
      return jsonResponse(200, { status: "ok" });
    };
    const results = await checkAll(
      {
        PRODUCTION_PUBLIC_URL: "https://producao.example",
        STAGING_PUBLIC_URL: "https://staging.example",
      },
      fetchImpl,
      { attempts: 2, timeoutMs: 1000 },
    );
    expect(calls).toEqual([
      "https://producao.example/api/health",
      "https://staging.example/api/health",
      "https://staging.example/api/health",
    ]);
    expect(exitCode(results)).toBe(1);
    expect(results.map(summaryLine).join("\n")).toBe("producao ok\nstaging HTTP 503");
  });

  it("repete o GET uma vez quando a primeira tentativa cai", async () => {
    let stagingCalls = 0;
    const fetchImpl = async (url: string) => {
      if (String(url).includes("staging")) {
        stagingCalls += 1;
        if (stagingCalls === 1) throw new Error("rede");
      }
      return jsonResponse(200, { status: "ok" });
    };
    const results = await checkAll(
      {
        PRODUCTION_PUBLIC_URL: "https://producao.example",
        STAGING_PUBLIC_URL: "https://staging.example",
      },
      fetchImpl,
      { attempts: 2, timeoutMs: 1000 },
    );
    expect(stagingCalls).toBe(2);
    expect(exitCode(results)).toBe(0);
  });

  it("falha sem vazar a URL quando a variável está vazia ou a rede cai", async () => {
    const fetchImpl = async () => {
      throw new TypeError("fetch failed https://interno.example/segredo");
    };
    const results = await checkAll(
      { PRODUCTION_PUBLIC_URL: "  ", STAGING_PUBLIC_URL: "https://staging.example" },
      fetchImpl,
      { attempts: 1, timeoutMs: 1000 },
    );
    const text = results.map(summaryLine).join("\n");
    expect(exitCode(results)).toBe(1);
    expect(text).toBe("producao url\nstaging rede");
    expect(text).not.toContain("http");
    expect(text).not.toContain("example");
  });

  it("o workflow não tem segredo e guarda só as URLs públicas", () => {
    const workflow = readFileSync(".github/workflows/keep-database-awake.yml", "utf8");
    const readme = readFileSync("README.md", "utf8");
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).toContain("vars.PRODUCTION_PUBLIC_URL");
    expect(workflow).toContain("vars.STAGING_PUBLIC_URL");
    expect(workflow).toContain('cron: "0 9 * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("último backup");
    expect(workflow).not.toContain("BACKUP_");
    expect(workflow).not.toMatch(/github_token|secrets\./i);
    expect(readme).toMatch(/60 dias/);
    expect(readme).toMatch(/Enable workflow/);
    expect(readme).toMatch(/30 horas/);
  });

  it("falha se o último backup bem-sucedido na main tiver 30 horas ou mais", async () => {
    const now = Date.parse("2026-10-25T12:00:00.000Z");
    const fresh = new Date(now - BACKUP_MAX_AGE_MS + 1).toISOString();
    const stale = new Date(now - BACKUP_MAX_AGE_MS).toISOString();
    expect(
      backupIsFresh(
        { conclusion: "success", head_branch: "main", updated_at: fresh },
        now,
      ),
    ).toBe(true);
    expect(
      backupIsFresh(
        { conclusion: "success", head_branch: "main", updated_at: stale },
        now,
      ),
    ).toBe(false);
    expect(
      backupIsFresh({ conclusion: "success", head_branch: "e7", updated_at: fresh }, now),
    ).toBe(false);

    const headers: Record<string, string>[] = [];
    const fetchImpl = async (
      _url: string,
      init?: { headers?: Record<string, string> },
    ) => {
      headers.push(init?.headers ?? {});
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            { conclusion: "success", head_branch: "main", updated_at: stale },
          ],
        }),
      };
    };
    const result = await checkBackupFreshness(fetchImpl, {
      now,
      repository: "dansilva-98/sistema-adrielli",
    });
    expect(result).toEqual({ ok: false, detail: "atrasado" });
    expect(backupRunsUrl()).toContain("/actions/workflows/backup.yml/runs?");
    expect(backupRunsUrl()).toContain("status=success");
    expect(backupRunsUrl()).toContain("branch=main");
    expect(JSON.stringify(headers)).not.toMatch(/authorization/i);
    expect(backupRunsUrl()).not.toMatch(/token|client_secret/i);
  });
});
