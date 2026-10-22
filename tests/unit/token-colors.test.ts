import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return filesUnder(fullPath);
    return [fullPath];
  });
}

describe("tokens de cor", () => {
  it("não usa cor hexadecimal fora do arquivo de tokens e do ícone", () => {
    const offenders = filesUnder("src")
      .filter((file) => /\.(tsx|css)$/.test(file))
      .filter((file) => !file.endsWith(`${path.sep}globals.css`))
      .filter((file) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
});
