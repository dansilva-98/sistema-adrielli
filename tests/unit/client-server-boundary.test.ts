import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverImport =
  /from\s+["'][^"']*(?:modules\/[^"']+\/server|db\/client|lib\/env\.server)["']|import\s+["']server-only["']/;

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return filesUnder(fullPath);
    return [fullPath];
  });
}

describe("fronteira de servidor", () => {
  it("componente de cliente não importa módulo de servidor", () => {
    const offenders = filesUnder("src")
      .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /^\s*["']use client["']/.test(source) && serverImport.test(source);
      });

    expect(offenders).toEqual([]);
  });
});
