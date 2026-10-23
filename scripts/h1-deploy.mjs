import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";

const token = required("NETLIFY_AUTH_TOKEN");
const siteId = required("NETLIFY_SITE_ID");

const child = spawn(
  "pnpm",
  ["exec", "netlify", "deploy", "--build", "--json", "--site", siteId],
  {
    env: { ...process.env, CI: "true", NETLIFY_AUTH_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const status = await new Promise((resolve) => child.on("close", resolve));
if (status !== 0) {
  console.error(redact(stderr || stdout));
  process.exit(status ?? 1);
}

const match = stdout.match(/\{[\s\S]*\}\s*$/);
if (!match) throw new Error("O deploy não devolveu JSON.");
const body = JSON.parse(match[0]);
const url = body.deploy_url ?? body.url;
if (!url) throw new Error("O deploy não devolveu a URL do rascunho.");
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
}
console.log(`Rascunho: ${url}`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

function redact(text) {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redigido]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]")
    .replaceAll(token, "[token]");
}
