export const MAPS_SEARCH_PREFIX = "https://www.google.com/maps/search/?api=1&query=";
export const MAPS_LINK_LABEL = "Ver no mapa (abre em nova aba)";
export const MAPS_LINK_TEXT = "Ver no mapa";

export function mapsSearchUrl(address: string | null | undefined): string | null {
  const query = address?.trim() ?? "";
  if (!query) return null;
  return `${MAPS_SEARCH_PREFIX}${encodeURIComponent(query)}`;
}
