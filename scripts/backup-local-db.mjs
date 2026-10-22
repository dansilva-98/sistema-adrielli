import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { join } from "node:path";

function loadLocalEnv() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function dump(extraArgs, file) {
  const binary = join(
    "node_modules",
    ".bin",
    process.platform === "win32" ? "supabase.cmd" : "supabase",
  );
  const args = ["db", "dump", "--local", ...extraArgs, "--file", file];
  const result =
    process.platform === "win32"
      ? spawnSync(`"${binary}" ${args.join(" ")}`, { encoding: "utf8", shell: true })
      : spawnSync(binary, args, { encoding: "utf8" });
  if (result.status !== 0) {
    console.error("supabase db dump falhou. O backup não foi gravado.");
    process.exit(1);
  }
}

loadLocalEnv();
if (process.env.APP_ENV !== "development") {
  console.error("db:backup recusado: só executa quando APP_ENV=development.");
  process.exit(1);
}

const directory = "backups";
mkdirSync(directory, { recursive: true });
const target = join(directory, `local-${stamp()}.sql`);
const schemaFile = join(directory, ".schema.sql");
const dataFile = join(directory, ".data.sql");

try {
  dump([], schemaFile);
  dump(["--data-only"], dataFile);
  writeFileSync(
    target,
    `-- schema\n${readFileSync(schemaFile, "utf8")}\n-- data\n${readFileSync(dataFile, "utf8")}`,
    { encoding: "utf8" },
  );
} finally {
  rmSync(schemaFile, { force: true });
  rmSync(dataFile, { force: true });
}

console.log(`Backup local gravado em ${target}`);
