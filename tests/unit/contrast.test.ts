import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function channel(hex: string): number[] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function linear(channelValue: number): number {
  const value = channelValue / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = channel(hex);
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function token(css: string, name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`token ausente: ${name}`);
  return match[1];
}

describe("contraste dos tokens", () => {
  it("mantém os pares de texto e fundo em WCAG AA", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const colors = {
      surface: token(css, "surface"),
      text: token(css, "text"),
      muted: token(css, "muted"),
      primary: token(css, "primary"),
      primaryForeground: token(css, "primary-foreground"),
      support: token(css, "support"),
      supportForeground: token(css, "support-foreground"),
      danger: token(css, "danger"),
      dangerForeground: token(css, "danger-foreground"),
    };

    const pairs = [
      ["text", "surface"],
      ["muted", "surface"],
      ["primaryForeground", "primary"],
      ["supportForeground", "support"],
      ["dangerForeground", "danger"],
      ["danger", "surface"],
      ["support", "surface"],
      ["primary", "surface"],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});
