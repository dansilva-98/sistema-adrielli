import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MapsLink } from "@/components/maps-link";
import {
  MAPS_LINK_LABEL,
  MAPS_LINK_TEXT,
  MAPS_SEARCH_PREFIX,
  mapsSearchUrl,
} from "@/modules/content/maps";

describe("URL do mapa", () => {
  it("codifica acentos, vírgula, & e #", () => {
    expect(mapsSearchUrl("Rua São João, 100")).toBe(
      `${MAPS_SEARCH_PREFIX}Rua%20S%C3%A3o%20Jo%C3%A3o%2C%20100`,
    );
    expect(mapsSearchUrl("A & B #1")).toBe(`${MAPS_SEARCH_PREFIX}A%20%26%20B%20%231`);
  });

  it("sem endereço não gera link", () => {
    expect(mapsSearchUrl("")).toBeNull();
    expect(mapsSearchUrl("   ")).toBeNull();
    expect(mapsSearchUrl(null)).toBeNull();
    expect(mapsSearchUrl(undefined)).toBeNull();
  });
});

describe("link Ver no mapa", () => {
  it("não renderiza nada sem endereço", () => {
    expect(renderToStaticMarkup(createElement(MapsLink, { address: "" }))).toBe("");
    expect(renderToStaticMarkup(createElement(MapsLink, { address: "  " }))).toBe("");
    expect(renderToStaticMarkup(createElement(MapsLink, { address: null }))).toBe("");
  });

  it("abre a busca do Maps numa aba nova, sem iframe nem script", () => {
    const address = "Rua São João, 100";
    const html = renderToStaticMarkup(createElement(MapsLink, { address }));
    expect(html).toContain(`href="${mapsSearchUrl(address)?.replaceAll("&", "&amp;")}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(`aria-label="${MAPS_LINK_LABEL}"`);
    expect(MAPS_LINK_LABEL.startsWith(MAPS_LINK_TEXT)).toBe(true);
    expect(html).toContain(MAPS_LINK_TEXT);
    expect(html).toContain("min-h-11");
    expect(html).toContain("text-primary");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("maps.googleapis.com");
  });
});
