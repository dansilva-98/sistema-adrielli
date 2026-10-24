export const SITE_NAME = "adrielli-flores";
export const STAGING_PUBLIC_URL = "https://staging--adrielli-flores.netlify.app";
export function publicSiteUrl(input) {
  if (input.mode !== "production") return STAGING_PUBLIC_URL;
  const url = input.siteUrl?.trim() ?? "";
  if (!url) throw new Error("URL do site de produção ausente.");
  if (url === STAGING_PUBLIC_URL) {
    throw new Error("Produção não usa o endereço de staging.");
  }
  return url;
}

export function assertExactSiteName(name) {
  if (name === "landingpageadrielliflores") {
    throw new Error("Recusado: este ID é do outro projeto e não pode ser usado.");
  }
  if (name !== SITE_NAME) {
    throw new Error(`Recusado: o site ${name} não é ${SITE_NAME}.`);
  }
}

export function resolveSitePlan(input) {
  const siteId = input.siteId?.trim() ?? "";
  if (input.mode === "production") {
    if (!siteId) {
      throw new Error("NETLIFY_SITE_ID ausente. Produção não procura nem cria site.");
    }
    return { action: "read", siteId };
  }
  if (siteId) return { action: "read", siteId };
  return { action: "find-or-create" };
}
