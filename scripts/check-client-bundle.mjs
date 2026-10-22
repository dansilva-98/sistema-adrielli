import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(".env.local")) {
  loadEnvFile(".env.local");
}

const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (key.length < 20) {
  console.error("SUPABASE_SERVICE_ROLE_KEY ausente ou curta demais para a varredura.");
  process.exit(1);
}

const root = path.resolve(".next/static");
if (!existsSync(root)) {
  console.error(".next/static não existe. Rode pnpm build antes.");
  process.exit(1);
}

const hits = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      walk(fullPath);
      continue;
    }
    const content = readFileSync(fullPath);
    if (content.includes(key)) hits.push(path.relative(process.cwd(), fullPath));
  }
}

walk(root);

if (hits.length > 0) {
  console.error("A service role key apareceu no bundle do navegador:");
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log("Bundle do navegador não contém a service role key.");
