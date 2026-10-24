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

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  const results = await checkAll(process.env, globalThis.fetch);
  for (const result of results) console.log(summaryLine(result));
  process.exit(exitCode(results));
}
