import { describe, expect, it } from "vitest";

import {
  TESTIMONIAL_IMAGE_ALT_MAX,
  testimonialImageAlt,
} from "@/modules/content/testimonial-alt";

describe("texto alternativo do depoimento", () => {
  it("repete a transcrição curta", () => {
    expect(testimonialImageAlt("  A família  agradece.  ")).toBe("A família agradece.");
  });

  it("corta em 250 caracteres e marca a omissão", () => {
    const quote = `${"a".repeat(TESTIMONIAL_IMAGE_ALT_MAX)}resto`;
    const alt = testimonialImageAlt(quote);
    expect(alt).toHaveLength(TESTIMONIAL_IMAGE_ALT_MAX + 1);
    expect(alt.endsWith("…")).toBe(true);
    expect(alt.slice(0, TESTIMONIAL_IMAGE_ALT_MAX)).toBe(
      "a".repeat(TESTIMONIAL_IMAGE_ALT_MAX),
    );
  });
});
