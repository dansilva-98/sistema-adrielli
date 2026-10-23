import { appendFileSync } from "node:fs";

const siteName = "adrielli-flores-h1";
const accountSlug = "dansilva-98";
const token = required("NETLIFY_AUTH_TOKEN");
const existing = process.env.NETLIFY_SITE_ID?.trim() ?? "";

const site = existing ? await readSite(existing) : await findOrCreateSite();

const output = [`id=${site.id}`, `name=${site.name}`, `url=${site.url}`].join("\n");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
console.log(`Site ${site.name}: ${site.url}`);
if (!existing) {
  console.log(`Cadastre a variável NETLIFY_SITE_ID=${site.id} no ambiente staging do GitHub.`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

async function findOrCreateSite() {
  const found = await findNamedSite();
  if (found) return found;
  return createSite();
}

async function readSite(siteId) {
  const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`Não foi possível ler o site: HTTP ${response.status}`);
  const body = await response.json();
  assertExactSite(body.name);
  return { id: body.id, name: body.name, url: body.ssl_url };
}

async function findNamedSite() {
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(
      `https://api.netlify.com/api/v1/${accountSlug}/sites?page=${page}&per_page=100`,
      { headers: authHeaders() },
    );
    if (!response.ok) throw new Error(`Não foi possível listar os sites: HTTP ${response.status}`);
    const sites = await response.json();
    if (!Array.isArray(sites) || sites.length === 0) return null;
    const match = sites.find((item) => item.name === siteName);
    if (match) return readSite(match.id);
    if (sites.length < 100) return null;
  }
  return null;
}

async function createSite() {
  const response = await fetch(`https://api.netlify.com/api/v1/${accountSlug}/sites`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ name: siteName }),
  });
  if (response.status === 422) {
    const found = await findNamedSite();
    if (found) return found;
    throw new Error(`O nome ${siteName} já existe e não apareceu na conta ${accountSlug}.`);
  }
  if (!response.ok) throw new Error(`Não foi possível criar o site: HTTP ${response.status}`);
  const body = await response.json();
  if (body.name !== siteName) {
    await deleteAccidentalSite(body.id);
    throw new Error(`Recusado: a Netlify devolveu ${body.name}. Nenhum site com sufixo foi mantido.`);
  }
  return readSite(body.id);
}

async function deleteAccidentalSite(siteId) {
  if (!siteId) return;
  const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `A Netlify criou um site com outro nome e não foi possível apagá-lo: HTTP ${response.status}`,
    );
  }
}

function assertExactSite(name) {
  if (name === "landingpageadrielliflores") {
    throw new Error("Recusado: este ID é do outro projeto e não pode ser usado.");
  }
  if (name !== siteName) {
    throw new Error(`Recusado: o site ${name} não é o rascunho ${siteName}.`);
  }
}

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}
