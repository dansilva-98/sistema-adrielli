import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import {
  EMPTY_PUBLIC_SITE,
  loadPublishedServices,
  loadPublicSite,
} from "@/modules/content/queries";
import { siteSettingsSchema } from "@/modules/content/schema";
import {
  CONTENT_CONFLICT_MESSAGE,
  ContentWriteError,
  createService,
  createTestimonial,
  moveContent,
  saveSiteSettings,
} from "@/modules/content/write";

const ACTOR = "33333333-3333-4333-8333-333333333333";

describe("escrita de conteúdo", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  const created: string[] = [];

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    await owner`insert into auth.users (id) values (${ACTOR}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${ACTOR}::uuid, 'STAFF', 'conteudo@example.com', 'Conteúdo')
    `;
  });

  afterAll(async () => {
    if (created.length > 0) {
      await owner`delete from content.services where id in ${owner(created)}`;
    }
    await owner`update content.site_settings set updated_by = null where updated_by = ${ACTOR}::uuid`;
    await owner`delete from identity.users where id = ${ACTOR}::uuid`;
    await owner`delete from auth.users where id = ${ACTOR}::uuid`;
    await owner?.end({ timeout: 5 });
    await runtime?.end({ timeout: 5 });
  });

  it("mostra só o publicado, trata linha ausente como vazio e limita o texto", async () => {
    const hiddenInput = service("oculto", false);
    const visibleInput = service("visivel", true);
    const hidden = await createService(runtime, hiddenInput, actor());
    const visible = await createService(runtime, visibleInput, actor());
    created.push(hidden, visible);
    await moveContent(runtime, "services", visible, 1, "up", actor());
    const published = await loadPublishedServices(runtime);
    expect(published.map((item) => item.slug)).toEqual([visibleInput.slug]);
    expect(published.some((item) => item.slug === hiddenInput.slug)).toBe(false);

    await expect(
      owner`update content.site_settings set hero_title = ${"a".repeat(81)} where id = 1`,
    ).rejects.toThrow(/value too long|valor é muito longo/i);

    await owner
      .begin(async (tx) => {
        await tx`delete from content.site_settings where id = 1`;
        expect(await loadPublicSite(tx)).toEqual(EMPTY_PUBLIC_SITE);
        throw new Error("rollback");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "rollback") return;
        throw error;
      });
    const restored = await loadPublicSite(runtime);
    expect(restored.howItWorks).toHaveLength(4);
  });

  it("recusa a segunda edição da mesma versão e não grava auditoria nela", async () => {
    const other = postgres(String(process.env.TEST_DATABASE_URL), {
      max: 1,
      prepare: false,
      connect_timeout: 5,
    });
    const input = settings("Primeira");
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled([
        saveSiteSettings(runtime, input, actor()),
        saveSiteSettings(other, settings("Segunda"), actor()),
      ]);
    } finally {
      await other.end({ timeout: 5 });
    }
    const rejected = results.find((result) => result.status === "rejected");
    const fulfilled = results.find((result) => result.status === "fulfilled");
    expect(fulfilled?.status).toBe("fulfilled");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(ContentWriteError);
      expect(CONTENT_CONFLICT_MESSAGE).toContain("Recarregue para ver a versão atual.");
    }
    const rows = await runtime<{ title: string; metadata: unknown }[]>`
      select s.hero_title as title, a.metadata
      from content.site_settings s
      join audit.audit_log a on a.actor_user_id = ${ACTOR}::uuid
      where a.action = 'content.site.updated'
    `;
    expect(rows).toHaveLength(1);
    expect(["Primeira", "Segunda"]).toContain(rows[0]?.title);
    expect(rows[0]?.metadata).toEqual({});
    expect(
      siteSettingsSchema.safeParse({ ...input, version: 2, heroTitle: "a".repeat(81) })
        .success,
    ).toBe(false);
  });

  it("não publica depoimento sem consentimento", async () => {
    await expect(
      createTestimonial(
        runtime,
        { quote: "Um relato", authorLabel: "Mãe", consentAt: null, published: true },
        actor(),
      ),
    ).rejects.toThrow(/testimonials_published_requires_consent/);
  });
});

function actor() {
  return { actorId: ACTOR, ip: null };
}

function service(name: string, published: boolean) {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    title: name,
    slug: `${name}-${id}`,
    summary: "Resumo",
    body: "Texto",
    imagePath: null,
    imageAlt: null,
    published,
  };
}

function settings(heroTitle: string) {
  return {
    version: 1,
    heroTitle,
    heroSubtitle: "",
    heroTagline: "",
    heroImagePath: null,
    heroImageAlt: null,
    aboutTitle: "",
    aboutBody: "",
    aboutImagePath: null,
    aboutImageAlt: null,
    howItWorks: [
      { title: "Contato", body: "" },
      { title: "Avaliação", body: "" },
      { title: "Atendimento", body: "" },
      { title: "Acompanhamento", body: "" },
    ],
    whatsappNumber: null,
    whatsappMessage: "",
    instagramHandle: null,
    contactEmail: null,
    supportEmail: null,
    addressText: null,
    serviceAreaText: null,
    seoTitle: "",
    seoDescription: "",
  };
}
