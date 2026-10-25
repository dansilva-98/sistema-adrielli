import { pathToFileURL } from "node:url";

export const HEALTH_TARGETS = [
  { id: "producao", variable: "PRODUCTION_PUBLIC_URL" },
  { id: "staging", variable: "STAGING_PUBLIC_URL" },
];

export function healthEndpoint(publicUrl) {
  if (typeof publicUrl !== "string" || publicUrl.trim() === "") {
    throw new Error("URL pública ausente.");
  }
  let url;
  try {
    url = new URL(publicUrl.trim());
  } catch {
    throw new Error("URL pública inválida.");
  }
  if (url.protocol !== "https:") {
    throw new Error("A URL pública precisa usar https.");
  }
  if (url.username || url.password) {
    throw new Error("A URL pública não pode carregar credencial.");
  }
  url.pathname = "/api/health";
  url.search = "";
  url.hash = "";
  return url.href;
}

export function isHealthyResponse(status, body) {
  return (
    status === 200 && body !== null && typeof body === "object" && body.status === "ok"
  );
}

async function readBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const URL_ERRORS = new Set([
  "URL pública ausente.",
  "URL pública inválida.",
  "A URL pública precisa usar https.",
  "A URL pública não pode carregar credencial.",
]);

function failureDetail(error) {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  return "rede";
}

export async function checkTarget(publicUrl, fetchImpl, options = {}) {
  const attempts = options.attempts ?? 2;
  const timeoutMs = options.timeoutMs ?? 90_000;
  let last = { ok: false, status: 0, detail: "sem-resposta" };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(healthEndpoint(publicUrl), {
        method: "GET",
        redirect: "manual",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await readBody(response);
      const ok = isHealthyResponse(response.status, body);
      last = { ok, status: response.status, detail: ok ? "ok" : "resposta" };
      if (ok) return last;
    } catch (error) {
      if (error instanceof Error && URL_ERRORS.has(error.message)) throw error;
      last = { ok: false, status: 0, detail: failureDetail(error) };
    }
  }
  return last;
}

export async function checkAll(env, fetchImpl, options) {
  const results = [];
  for (const target of HEALTH_TARGETS) {
    try {
      const result = await checkTarget(env[target.variable], fetchImpl, options);
      results.push({ id: target.id, ...result });
    } catch {
      results.push({ id: target.id, ok: false, status: 0, detail: "url" });
    }
  }
  return results;
}

export function summaryLine(result) {
  if (result.ok) return `${result.id} ok`;
  if (result.status > 0) return `${result.id} HTTP ${result.status}`;
  return `${result.id} ${result.detail}`;
}

export function exitCode(results) {
  return results.every((result) => result.ok) ? 0 : 1;
}

export const BACKUP_WORKFLOW_FILE = "backup.yml";
export const BACKUP_MAX_AGE_MS = 30 * 60 * 60 * 1000;
const GITHUB_REPOSITORY = "dansilva-98/sistema-adrielli";

export function backupRunsUrl(repository = GITHUB_REPOSITORY) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("Repositório do backup inválido.");
  }
  const url = new URL(
    `https://api.github.com/repos/${repository}/actions/workflows/${BACKUP_WORKFLOW_FILE}/runs`,
  );
  url.searchParams.set("branch", "main");
  url.searchParams.set("status", "success");
  url.searchParams.set("per_page", "1");
  return url.href;
}

export function backupIsFresh(run, now, maxAgeMs = BACKUP_MAX_AGE_MS) {
  if (!run || run.conclusion !== "success" || run.head_branch !== "main") return false;
  const completed = Date.parse(run.updated_at);
  if (!Number.isFinite(completed)) return false;
  return now - completed < maxAgeMs;
}

export async function checkBackupFreshness(fetchImpl, options = {}) {
  const now = options.now ?? Date.now();
  const repository = options.repository ?? GITHUB_REPOSITORY;
  try {
    const response = await fetchImpl(backupRunsUrl(repository), {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "adrielli-flores-banco-ativo",
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!response.ok) return { ok: false, detail: "api" };
    const body = await response.json();
    const run = Array.isArray(body?.workflow_runs) ? body.workflow_runs[0] : undefined;
    const ok = backupIsFresh(run, now);
    return { ok, detail: ok ? "ok" : "atrasado" };
  } catch {
    return { ok: false, detail: "rede" };
  }
}

export function combinedExit(healthResults, backupResult) {
  return exitCode(healthResults) === 0 && backupResult.ok ? 0 : 1;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  const results = await checkAll(process.env, globalThis.fetch);
  for (const result of results) console.log(summaryLine(result));
  const repository = process.env.GITHUB_REPOSITORY || undefined;
  const backup = await checkBackupFreshness(globalThis.fetch, { repository });
  console.log(backup.ok ? "backup ok" : `backup ${backup.detail}`);
  process.exit(combinedExit(results, backup));
}
