export const SITE_NAME = "adrielli-flores";
export const STAGING_PUBLIC_URL = "https://staging--adrielli-flores.netlify.app";
export const PRODUCTION_ORIGIN = "https://adrielliflores.com.br";
export const PRODUCTION_WWW_HOST = "www.adrielliflores.com.br";

export function publicSiteUrl(input) {
  if (input.mode === "production") return PRODUCTION_ORIGIN;
  return STAGING_PUBLIC_URL;
}

export function productionDomainUpdate(domainAliases) {
  const aliases = new Set(
    (domainAliases ?? []).filter((alias) => alias && alias !== "adrielliflores.com.br"),
  );
  aliases.add(PRODUCTION_WWW_HOST);
  return {
    custom_domain: "adrielliflores.com.br",
    domain_aliases: [...aliases].sort(),
  };
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
