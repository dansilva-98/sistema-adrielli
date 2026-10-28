import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

async function lint(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: process.cwd() });
  const results = await eslint.lintText(code, { filePath });
  return results.flatMap((result) => result.messages);
}

describe("fronteiras de módulo", () => {
  it("falha quando app/(public) importa modules/clinic", async () => {
    const messages = await lint(
      "src/app/(public)/boundary-violation.tsx",
      'import { clinicModule } from "@/modules/clinic";\nexport const value = clinicModule;\n',
    );
    expect(messages.some((message) => message.ruleId === "boundaries/dependencies")).toBe(
      true,
    );
  });

  it("permite que app/(public) importe modules/identity", async () => {
    const messages = await lint(
      "src/app/(public)/boundary-allowed.tsx",
      'import { identityModule } from "@/modules/identity";\nexport const value = identityModule;\n',
    );
    expect(messages.filter((message) => message.severity === 2)).toEqual([]);
  });

  it("app/(public) não importa modules/clinic", () => {
    const root = join(process.cwd(), "src", "app", "(public)");
    const offenders = sourceFiles(root).filter((file) =>
      /modules\/clinic/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("falha quando content importa clinic", async () => {
    const messages = await lint(
      "src/modules/content/boundary-violation.ts",
      'import { clinicModule } from "@/modules/clinic";\nexport const value = clinicModule;\n',
    );
    expect(messages.some((message) => message.ruleId === "boundaries/dependencies")).toBe(
      true,
    );
  });
});
