import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tokens de espaçamento", () => {
  it("não define --spacing- com nome de tamanho do Tailwind", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).not.toMatch(/--spacing-(xs|sm|md|lg|xl)\s*:/);
  });
});
