import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

const patientField =
  "(?:fullName|full_name|preferredName|preferred_name|birthDate|birth_date|cpf|phone|email|addressText|address_text|originalName|original_name)";

describe("privacidade do consultório", () => {
  it("não escreve dado de paciente em console ou mensagem de erro", () => {
    const files = sourceFiles(join(process.cwd(), "src", "modules", "clinic"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\bconsole\s*\./);
      expect(source, file).not.toMatch(
        new RegExp(`throw new Error\\(\`[^\`]*\\$\\{[^}]*${patientField}`),
      );
      expect(source, file).not.toMatch(
        new RegExp(`message:\\s*\`[^\`]*\\$\\{[^}]*${patientField}`),
      );
    }
  });
});
