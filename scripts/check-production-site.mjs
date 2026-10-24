import { pathToFileURL } from "node:url";

export const PRODUCTION_ORIGIN = "https://adrielliflores.com.br";
export const PUBLIC_PATHS = ["/", "/sobre", "/servicos", "/contato", "/materiais"];
const BLOCKED_ROBOTS = ["/admin", "/consultorio", "/equipe", "/api"];
const SECURITY_HEADERS = [
  "content-security-policy",
  "permissions-policy",
  "referrer-policy",
  "strict-transport-security",
  "x-content-type-options",
];

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

export function adminRedirectsToLogin(admin) {
  if (![301, 302, 303, 307, 308].includes(admin.status)) return false;
  try {
    const url = new URL(admin.location, PRODUCTION_ORIGIN);
    return url.origin === PRODUCTION_ORIGIN && url.pathname === "/equipe/sair";
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
    if (page.path === "/" && !hasSecurityHeaders(page.headers))
      failures.push("cabecalhos");
  }
  if (!adminRedirectsToLogin(input.admin)) failures.push("admin");
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

async function fetchPath(pathname, fetchImpl) {
  return fetchImpl(new URL(pathname, PRODUCTION_ORIGIN), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
}

export async function collectProduction(fetchImpl) {
  const healthResponse = await fetchPath("/api/health", fetchImpl);
  let healthBody = null;
  try {
    healthBody = await healthResponse.json();
  } catch {
    healthBody = null;
  }
  const robotsResponse = await fetchPath("/robots.txt", fetchImpl);
  const robots = await readText(robotsResponse);
  const pages = [];
  for (const path of PUBLIC_PATHS) {
    const response = await fetchPath(path, fetchImpl);
    pages.push({
      path,
      status: response.status,
      html: await readText(response),
      robotsHeader: response.headers.get("x-robots-tag") ?? "",
      headers: headerRecord(response),
    });
  }
  const adminResponse = await fetchPath("/admin", fetchImpl);
  return {
    health: { status: healthResponse.status, body: healthBody },
    robots,
    pages,
    admin: {
      status: adminResponse.status,
      location: adminResponse.headers.get("location") ?? "",
    },
  };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  try {
    const failures = assessProduction(await collectProduction(globalThis.fetch));
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
