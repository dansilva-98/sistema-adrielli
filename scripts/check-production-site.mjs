import { pathToFileURL } from "node:url";

export const PUBLIC_PATHS = [
  "/",
  "/sobre",
  "/servicos",
  "/contato",
  "/materiais",
  "/privacidade",
];
export const RETRY_LIMIT_MS = 15 * 60 * 1000;
export const RETRY_INTERVAL_MS = 30_000;
const BLOCKED_ROBOTS = ["/admin", "/consultorio", "/equipe", "/api"];
const SECURITY_HEADERS = [
  "content-security-policy",
  "permissions-policy",
  "referrer-policy",
  "strict-transport-security",
  "x-content-type-options",
];

export function productionOrigin(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("PRODUCTION_PUBLIC_URL ausente.");
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("PRODUCTION_PUBLIC_URL inválida.");
  }
  if (url.protocol !== "https:") {
    throw new Error("PRODUCTION_PUBLIC_URL precisa usar https.");
  }
  if (url.username || url.password) {
    throw new Error("PRODUCTION_PUBLIC_URL não pode carregar credencial.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.origin;
}

export function assessRobots(body) {
  const lines = String(body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valueOf = (prefix) =>
    lines
      .filter((line) => line.toLowerCase().startsWith(prefix))
      .map((line) => line.slice(prefix.length).trim());
  const allows = valueOf("allow:");
  const disallows = valueOf("disallow:");
  return (
    allows.includes("/") &&
    !disallows.includes("/") &&
    BLOCKED_ROBOTS.every((path) => disallows.includes(path))
  );
}

export function pageIsIndexable(page) {
  if (page.status !== 200) return false;
  if (/noindex/i.test(page.robotsHeader ?? "")) return false;
  const meta = String(page.html).match(/<meta[^>]*name=["']robots["'][^>]*>/i);
  return !(meta && /noindex/i.test(meta[0]));
}

export function adminRedirectsToLogin(admin, origin) {
  if (![301, 302, 303, 307, 308].includes(admin.status)) return false;
  try {
    const url = new URL(admin.location, origin);
    return url.origin === origin && url.pathname === "/equipe/sair";
  } catch {
    return false;
  }
}

export function wwwUrl(origin) {
  const url = new URL(origin);
  return `https://www.${url.hostname}/`;
}

export function wwwRedirectsToApex(www, origin) {
  if (www?.status !== 301) return false;
  try {
    const target = new URL(www.location, origin);
    return target.origin === origin && target.pathname === "/";
  } catch {
    return false;
  }
}

export function hasSecurityHeaders(headers) {
  return SECURITY_HEADERS.every((name) => (headers[name] ?? "").trim() !== "");
}

export function assessProduction(input) {
  const failures = [];
  if (!(input.health.status === 200 && input.health.body?.status === "ok")) {
    failures.push("health");
  }
  if (!assessRobots(input.robots)) failures.push("robots");
  for (const page of input.pages) {
    if (!pageIsIndexable(page)) failures.push(`pagina ${page.path}`);
    if (page.path === "/" && !hasSecurityHeaders(page.headers)) {
      failures.push("cabecalhos");
    }
  }
  if (!adminRedirectsToLogin(input.admin, input.origin)) failures.push("admin");
  if (!wwwRedirectsToApex(input.www, input.origin)) failures.push("www");
  return failures;
}

async function readText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function headerRecord(response) {
  const headers = {};
  for (const name of SECURITY_HEADERS) headers[name] = response.headers.get(name) ?? "";
  return headers;
}

async function fetchPath(origin, pathname, fetchImpl) {
  return fetchImpl(new URL(pathname, origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
}

export async function collectProduction(origin, fetchImpl) {
  const healthResponse = await fetchPath(origin, "/api/health", fetchImpl);
  let healthBody = null;
  try {
    healthBody = await healthResponse.json();
  } catch {
    healthBody = null;
  }
  const robotsResponse = await fetchPath(origin, "/robots.txt", fetchImpl);
  const robots = await readText(robotsResponse);
  const pages = [];
  for (const path of PUBLIC_PATHS) {
    const response = await fetchPath(origin, path, fetchImpl);
    pages.push({
      path,
      status: response.status,
      html: await readText(response),
      robotsHeader: response.headers.get("x-robots-tag") ?? "",
      headers: headerRecord(response),
    });
  }
  const adminResponse = await fetchPath(origin, "/admin", fetchImpl);
  const wwwResponse = await fetchImpl(wwwUrl(origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  return {
    origin,
    health: { status: healthResponse.status, body: healthBody },
    robots,
    pages,
    admin: {
      status: adminResponse.status,
      location: adminResponse.headers.get("location") ?? "",
    },
    www: {
      status: wwwResponse.status,
      location: wwwResponse.headers.get("location") ?? "",
    },
  };
}

export async function waitForProduction(origin, fetchImpl, options = {}) {
  const limitMs = options.limitMs ?? RETRY_LIMIT_MS;
  const intervalMs = options.intervalMs ?? RETRY_INTERVAL_MS;
  const sleep =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  const collect = options.collect ?? collectProduction;
  let last = ["rede"];
  for (;;) {
    try {
      const failures = assessProduction(await collect(origin, fetchImpl));
      if (failures.length === 0) return [];
      if (!failures.includes("health")) return failures;
      last = failures;
    } catch {
      last = ["rede"];
    }
    if (now() - started + intervalMs > limitMs) return last;
    await sleep(intervalMs);
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  let origin;
  try {
    origin = productionOrigin(process.env.PRODUCTION_PUBLIC_URL);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PRODUCTION_PUBLIC_URL ausente.";
    console.log(message);
    process.exit(1);
  }
  try {
    const failures = await waitForProduction(origin, globalThis.fetch);
    if (failures.length === 0) {
      console.log("producao ok");
    } else {
      console.log(`producao falhou: ${failures.join(", ")}`);
      process.exit(1);
    }
  } catch {
    console.log("producao sem resposta");
    process.exit(1);
  }
}
