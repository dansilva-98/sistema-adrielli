import type { Metadata, MetadataRoute } from "next";

const BRAND = "Adrielli Flores";

export function publicPageMetadata(input: {
  pageName: string;
  seoTitle: string;
  seoDescription: string;
  path: string;
}): Metadata {
  const seoTitle = input.seoTitle.trim();
  const description = input.seoDescription.trim();
  const title = `${input.pageName} · ${seoTitle || BRAND}`;
  return {
    title,
    description: description || undefined,
    openGraph: {
      title,
      description: description || undefined,
      url: input.path,
    },
  };
}

export function robotsPolicy(
  appEnv: "development" | "staging" | "production",
): MetadataRoute.Robots {
  if (appEnv === "production") {
    return {
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/consultorio", "/equipe", "/api"],
      },
    };
  }
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}

export function publicSitemap(siteUrl: string): MetadataRoute.Sitemap {
  const base = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
  return ["/", "/sobre", "/servicos", "/contato", "/materiais", "/privacidade"].map(
    (path) => ({
      url: path === "/" ? `${base}/` : `${base}${path}`,
    }),
  );
}
