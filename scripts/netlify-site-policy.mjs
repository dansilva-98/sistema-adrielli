export const SITE_NAME = "adrielli-flores";

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
