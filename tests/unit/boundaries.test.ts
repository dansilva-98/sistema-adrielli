import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

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
