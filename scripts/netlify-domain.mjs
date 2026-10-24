import { assertExactSiteName, productionDomainUpdate } from "./netlify-site-policy.mjs";

const token = required("NETLIFY_AUTH_TOKEN");
const siteId = required("NETLIFY_SITE_ID");

const site = await readSite();
assertExactSiteName(site.name);
const updated = await updateDomain(productionDomainUpdate(site.domain_aliases));
if (updated.custom_domain !== "adrielliflores.com.br") {
  throw new Error("Recusado: o domínio principal não ficou no apex.");
}
console.log("Domínio adrielliflores.com.br; www redireciona para ele.");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

async function readSite() {
  const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Recusado: não foi possível ler o site. HTTP ${response.status}`);
  }
  return response.json();
}

async function updateDomain(body) {
  const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Recusado: não foi possível ligar o domínio. HTTP ${response.status}`,
    );
  }
  return response.json();
}
