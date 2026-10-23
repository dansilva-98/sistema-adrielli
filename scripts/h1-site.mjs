import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const token = required("NETLIFY_AUTH_TOKEN");
const existing = process.env.NETLIFY_SITE_ID?.trim() ?? "";

const site = existing ? await readSite(existing) : await createSite();

const output = [`id=${site.id}`, `name=${site.name}`, `url=${site.url}`].join("\n");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
console.log(`Site ${site.name}: ${site.url}`);
if (!existing) {
  console.log(
    `Cadastre a variável NETLIFY_SITE_ID=${site.id} no ambiente staging do GitHub.`,
  );
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

async function readSite(siteId) {
  const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(`Não foi possível ler o site: HTTP ${response.status}`);
  const body = await response.json();
  if (body.name === "landingpageadrielliflores") {
    throw new Error("Recusado: este ID é do outro projeto e não pode ser usado.");
  }
  return { id: body.id, name: body.name, url: body.ssl_url };
}

async function createSite() {
  const created = spawnSync(
    "pnpm",
    [
      "exec",
      "netlify",
      "sites:create",
      "--name",
      "adrielli-flores-h1",
      "--account-slug",
      "dansilva-98",
      "--manual",
      "--disable-linking",
      "--json",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, CI: "true", NETLIFY_AUTH_TOKEN: token },
    },
  );
  const details = redact(`${created.stdout}\n${created.stderr}`);
  if (created.status !== 0) throw new Error(`sites:create falhou.\n${details}`);
  const match = created.stdout.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("sites:create não devolveu JSON.");
  const body = JSON.parse(match[0]);
  const siteId = body.id ?? body.site_id;
  if (!siteId) throw new Error("sites:create não devolveu o ID.");
  return readSite(siteId);
}

function redact(text) {
  return text.replaceAll(token, "[token]");
}
