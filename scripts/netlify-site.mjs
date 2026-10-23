import { appendFileSync } from "node:fs";

import {
  assertExactSiteName,
  resolveSitePlan,
  SITE_NAME,
} from "./netlify-site-policy.mjs";

const accountSlug = "dansilva-98";
const token = required("NETLIFY_AUTH_TOKEN");
const plan = resolveSitePlan({
  mode: process.env.NETLIFY_SITE_MODE ?? "staging",
  siteId: process.env.NETLIFY_SITE_ID,
});

const site =
  plan.action === "read" ? await readSite(plan.siteId) : await findOrCreateSite();
const url = site.url || `https://${site.name}.netlify.app`;

const output = [`id=${site.id}`, `name=${site.name}`, `url=${url}`].join("\n");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
console.log(`Site ${site.name}`);

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
  if (!response.ok)
    throw new Error(`Não foi possível ler o site: HTTP ${response.status}`);
  const body = await response.json();
  assertAcceptedSite(body.name);
  return { id: body.id, name: body.name, url: body.ssl_url ?? "" };
}

async function findNamedSite() {
  const matches = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(
      `https://api.netlify.com/api/v1/${accountSlug}/sites?page=${page}&per_page=100`,
      { headers: authHeaders() },
    );
    if (!response.ok) {
      throw new Error(`Não foi possível listar os sites: HTTP ${response.status}`);
    }
    const sites = await response.json();
    if (!Array.isArray(sites)) throw new Error("A lista de sites não veio em lista.");
    if (sites.length === 0) break;
    for (const item of sites) {
      if (item.name === SITE_NAME) matches.push(item);
    }
    if (sites.length < 100) break;
  }
  const preferred = matches[0];
  if (!preferred) return null;
  return readSite(preferred.id);
}

async function createSite() {
  const response = await fetch(`https://api.netlify.com/api/v1/${accountSlug}/sites`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ name: SITE_NAME }),
  });
  if (response.status === 422) {
    const found = await findNamedSite();
    if (found) return found;
    throw new Error(
      `O nome ${SITE_NAME} já existe e não apareceu na conta ${accountSlug}.`,
    );
  }
  if (!response.ok)
    throw new Error(`Não foi possível criar o site: HTTP ${response.status}`);
  const body = await response.json();
  if (body.name !== SITE_NAME) {
    await deleteAccidentalSite(body.id);
    throw new Error(
      `Recusado: a Netlify devolveu ${body.name}. Nenhum site com sufixo foi mantido.`,
    );
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

function assertAcceptedSite(name) {
  assertExactSiteName(name);
}

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}
