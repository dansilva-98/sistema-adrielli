import type postgres from "postgres";

import type { AuditAction } from "@/db/audit-actions";
import { recordAudit } from "@/modules/audit/record";
import type {
  AboutSectionInput,
  ContactSectionInput,
  FaqInput,
  HeroSectionInput,
  HowSectionInput,
  SearchSectionInput,
  ServiceInput,
  SiteSection,
  SiteSettingsInput,
  TestimonialInput,
} from "@/modules/content/schema";

export const CONTENT_CONFLICT_MESSAGE =
  "Este conteúdo foi alterado por outra pessoa. Recarregue para ver a versão atual.";
export const CONTENT_SLUG_MESSAGE = "Este endereço já está em uso.";
export const CONTENT_CONSENT_MESSAGE = "Publique só com a data do consentimento.";
export const CONTENT_WITHDRAW_MESSAGE =
  "Se a autorização foi retirada, exclua o depoimento.";

export class ContentWriteError extends Error {
  readonly code: "conflict" | "missing" | "slug" | "consent" | "withdrawn";

  constructor(code: ContentWriteError["code"]) {
    super(code);
    this.name = "ContentWriteError";
    this.code = code;
  }
}

type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;
type Actor = { actorId: string; ip: string | null };
type ListTable = "services" | "testimonials" | "faq";

const LIST_ACTIONS = {
  services: {
    created: "content.service.created",
    updated: "content.service.updated",
    deleted: "content.service.deleted",
    entity: "service",
  },
  testimonials: {
    created: "content.testimonial.created",
    updated: "content.testimonial.updated",
    deleted: "content.testimonial.deleted",
    entity: "testimonial",
  },
  faq: {
    created: "content.faq.created",
    updated: "content.faq.updated",
    deleted: "content.faq.deleted",
    entity: "faq",
  },
} as const satisfies Record<
  ListTable,
  { created: AuditAction; updated: AuditAction; deleted: AuditAction; entity: string }
>;

export async function saveSiteSettings(
  sql: Sql,
  input: SiteSettingsInput,
  actor: Actor,
): Promise<{ removedPaths: string[] }> {
  return sql.begin(async (tx) => {
    const current = await tx<
      { hero_image_path: string | null; about_image_path: string | null }[]
    >`
      select hero_image_path, about_image_path
      from content.site_settings
      where id = 1
      for update
    `;
    const row = current[0];
    if (!row) throw new ContentWriteError("missing");
    const updated = await tx`
      update content.site_settings
      set hero_title = ${input.heroTitle},
        hero_subtitle = ${input.heroSubtitle},
        hero_tagline = ${input.heroTagline},
        hero_image_path = ${input.heroImagePath},
        hero_image_alt = ${input.heroImageAlt},
        about_title = ${input.aboutTitle},
        about_body = ${input.aboutBody},
        about_image_path = ${input.aboutImagePath},
        about_image_alt = ${input.aboutImageAlt},
        how_it_works = ${tx.json(input.howItWorks)},
        whatsapp_number = ${input.whatsappNumber},
        whatsapp_message = ${input.whatsappMessage},
        instagram_handle = ${input.instagramHandle},
        contact_email = ${input.contactEmail},
        support_email = ${input.supportEmail},
        address_text = ${input.addressText},
        service_area_text = ${input.serviceAreaText},
        seo_title = ${input.seoTitle},
        seo_description = ${input.seoDescription},
        updated_at = now(),
        updated_by = ${actor.actorId}::uuid,
        version = version + 1
      where id = 1 and version = ${input.version}
    `;
    if (updated.count !== 1) throw new ContentWriteError("conflict");
    await writeAudit(tx, actor, "content.site.updated", "site_settings", null);
    if (row.hero_image_path !== input.heroImagePath && input.heroImagePath) {
      await writeAudit(tx, actor, "content.image.uploaded", "site_settings", null);
    }
    if (row.about_image_path !== input.aboutImagePath && input.aboutImagePath) {
      await writeAudit(tx, actor, "content.image.uploaded", "site_settings", null);
    }
    return {
      removedPaths: [row.hero_image_path, row.about_image_path].filter(
        (path): path is string =>
          Boolean(path) && path !== input.heroImagePath && path !== input.aboutImagePath,
      ),
    };
  });
}

export async function saveSiteSection(
  sql: Sql,
  section: SiteSection,
  input:
    | HeroSectionInput
    | AboutSectionInput
    | HowSectionInput
    | ContactSectionInput
    | SearchSectionInput,
  actor: Actor,
): Promise<{ removedPaths: string[]; version: number }> {
  return sql.begin(async (tx) => {
    const current = await tx<
      { hero_image_path: string | null; about_image_path: string | null }[]
    >`
      select hero_image_path, about_image_path
      from content.site_settings
      where id = 1
      for update
    `;
    const row = current[0];
    if (!row) throw new ContentWriteError("missing");
    const saved = await updateSiteSection(tx, section, input, actor.actorId);
    if (!saved) throw new ContentWriteError("conflict");
    await writeAudit(tx, actor, "content.site.updated", "site_settings", null);
    const removed = removedSectionImage(section, row, input);
    if (removed?.uploaded) {
      await writeAudit(tx, actor, "content.image.uploaded", "site_settings", null);
    }
    return { removedPaths: removed?.removed ? [removed.removed] : [], version: saved };
  });
}

async function updateSiteSection(
  tx: Tx,
  section: SiteSection,
  input:
    | HeroSectionInput
    | AboutSectionInput
    | HowSectionInput
    | ContactSectionInput
    | SearchSectionInput,
  actorId: string,
): Promise<number | null> {
  const rows =
    section === "hero"
      ? await tx<{ version: number }[]>`
          update content.site_settings
          set hero_title = ${(input as HeroSectionInput).heroTitle},
            hero_subtitle = ${(input as HeroSectionInput).heroSubtitle},
            hero_tagline = ${(input as HeroSectionInput).heroTagline},
            hero_image_path = ${(input as HeroSectionInput).heroImagePath},
            hero_image_alt = ${(input as HeroSectionInput).heroImageAlt},
            updated_at = now(),
            updated_by = ${actorId}::uuid,
            version = version + 1
          where id = 1 and version = ${input.version}
          returning version
        `
      : section === "about"
        ? await tx<{ version: number }[]>`
            update content.site_settings
            set about_title = ${(input as AboutSectionInput).aboutTitle},
              about_body = ${(input as AboutSectionInput).aboutBody},
              about_image_path = ${(input as AboutSectionInput).aboutImagePath},
              about_image_alt = ${(input as AboutSectionInput).aboutImageAlt},
              updated_at = now(),
              updated_by = ${actorId}::uuid,
              version = version + 1
            where id = 1 and version = ${input.version}
            returning version
          `
        : section === "how"
          ? await tx<{ version: number }[]>`
              update content.site_settings
              set how_it_works = ${tx.json((input as HowSectionInput).howItWorks)},
                updated_at = now(),
                updated_by = ${actorId}::uuid,
                version = version + 1
              where id = 1 and version = ${input.version}
              returning version
            `
          : section === "contact"
            ? await tx<{ version: number }[]>`
                update content.site_settings
                set whatsapp_number = ${(input as ContactSectionInput).whatsappNumber},
                  whatsapp_message = ${(input as ContactSectionInput).whatsappMessage},
                  contact_email = ${(input as ContactSectionInput).contactEmail},
                  address_text = ${(input as ContactSectionInput).addressText},
                  service_area_text = ${(input as ContactSectionInput).serviceAreaText},
                  updated_at = now(),
                  updated_by = ${actorId}::uuid,
                  version = version + 1
                where id = 1 and version = ${input.version}
                returning version
              `
            : await tx<{ version: number }[]>`
                update content.site_settings
                set instagram_handle = ${(input as SearchSectionInput).instagramHandle},
                  support_email = ${(input as SearchSectionInput).supportEmail},
                  seo_title = ${(input as SearchSectionInput).seoTitle},
                  seo_description = ${(input as SearchSectionInput).seoDescription},
                  updated_at = now(),
                  updated_by = ${actorId}::uuid,
                  version = version + 1
                where id = 1 and version = ${input.version}
                returning version
              `;
  return rows[0]?.version ?? null;
}

function removedSectionImage(
  section: SiteSection,
  row: { hero_image_path: string | null; about_image_path: string | null },
  input:
    | HeroSectionInput
    | AboutSectionInput
    | HowSectionInput
    | ContactSectionInput
    | SearchSectionInput,
): { removed: string | null; uploaded: boolean } | null {
  if (section === "hero") {
    const next = (input as HeroSectionInput).heroImagePath;
    const previous = row.hero_image_path;
    return {
      uploaded: Boolean(next && next !== previous),
      removed:
        previous && previous !== next && previous !== row.about_image_path
          ? previous
          : null,
    };
  }
  if (section === "about") {
    const next = (input as AboutSectionInput).aboutImagePath;
    const previous = row.about_image_path;
    return {
      uploaded: Boolean(next && next !== previous),
      removed:
        previous && previous !== next && previous !== row.hero_image_path
          ? previous
          : null,
    };
  }
  return null;
}

export async function createService(
  sql: Sql,
  input: ServiceInput,
  actor: Actor,
): Promise<string> {
  try {
    return await sql.begin(async (tx) => {
      const sortOrder = await nextSortOrder(tx, "services");
      const rows = await tx<{ id: string }[]>`
        insert into content.services (
          title, slug, summary, body, image_path, image_alt, published, sort_order, updated_by
        )
        values (
          ${input.title}, ${input.slug}, ${input.summary}, ${input.body},
          ${input.imagePath}, ${input.imageAlt}, ${input.published}, ${sortOrder},
          ${actor.actorId}::uuid
        )
        returning id
      `;
      const id = rows[0]?.id;
      if (!id) throw new Error("Falha ao criar o serviço.");
      await writeAudit(tx, actor, "content.service.created", "service", id);
      if (input.imagePath)
        await writeAudit(tx, actor, "content.image.uploaded", "service", id);
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ContentWriteError("slug");
    throw error;
  }
}

export async function updateService(
  sql: Sql,
  id: string,
  input: ServiceInput & { version: number },
  actor: Actor,
): Promise<{ removedPaths: string[] }> {
  try {
    return await sql.begin(async (tx) => {
      const current = await tx<{ image_path: string | null }[]>`
        select image_path from content.services where id = ${id}::uuid for update
      `;
      if (!current[0]) throw new ContentWriteError("missing");
      const updated = await tx`
        update content.services
        set title = ${input.title}, slug = ${input.slug}, summary = ${input.summary},
          body = ${input.body}, image_path = ${input.imagePath}, image_alt = ${input.imageAlt},
          published = ${input.published}, updated_at = now(), updated_by = ${actor.actorId}::uuid,
          version = version + 1
        where id = ${id}::uuid and version = ${input.version}
      `;
      if (updated.count !== 1) throw new ContentWriteError("conflict");
      await writeAudit(tx, actor, "content.service.updated", "service", id);
      if (input.imagePath && input.imagePath !== current[0].image_path) {
        await writeAudit(tx, actor, "content.image.uploaded", "service", id);
      }
      const previous = current[0].image_path;
      return { removedPaths: previous && previous !== input.imagePath ? [previous] : [] };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ContentWriteError("slug");
    throw error;
  }
}

export async function createTestimonial(sql: Sql, input: TestimonialInput, actor: Actor) {
  return insertList(sql, "testimonials", actor, async (tx) => {
    const sortOrder = await nextSortOrder(tx, "testimonials");
    const rows = await tx<{ id: string }[]>`
      insert into content.testimonials (
        quote, author_label, consent_at, published, sort_order, updated_by
      )
      values (
        ${input.quote}, ${input.authorLabel}, ${input.consentAt}, ${input.published},
        ${sortOrder}, ${actor.actorId}::uuid
      )
      returning id
    `;
    return rows[0]?.id;
  });
}

export async function updateTestimonial(
  sql: Sql,
  id: string,
  input: TestimonialInput & { version: number },
  actor: Actor,
) {
  const updated = await sql.begin(async (tx) => {
    const current = await tx<{ consent_at: string | null }[]>`
      select consent_at::text as consent_at
      from content.testimonials
      where id = ${id}::uuid
      for update
    `;
    if (!current[0]) throw new ContentWriteError("missing");
    if (current[0].consent_at && !input.consentAt) {
      throw new ContentWriteError("withdrawn");
    }
    const result = await tx`
      update content.testimonials
      set quote = ${input.quote}, author_label = ${input.authorLabel},
        consent_at = ${input.consentAt}, published = ${input.published},
        updated_at = now(), updated_by = ${actor.actorId}::uuid, version = version + 1
      where id = ${id}::uuid and version = ${input.version}
    `;
    if (result.count !== 1) {
      const exists = await tx<{ id: string }[]>`
        select id from content.testimonials where id = ${id}::uuid
      `;
      throw new ContentWriteError(exists[0] ? "conflict" : "missing");
    }
    await writeAudit(tx, actor, "content.testimonial.updated", "testimonial", id);
  });
  return updated;
}

export async function createFaq(sql: Sql, input: FaqInput, actor: Actor) {
  return insertList(sql, "faq", actor, async (tx) => {
    const sortOrder = await nextSortOrder(tx, "faq");
    const rows = await tx<{ id: string }[]>`
      insert into content.faq (question, answer, published, sort_order, updated_by)
      values (
        ${input.question}, ${input.answer}, ${input.published}, ${sortOrder},
        ${actor.actorId}::uuid
      )
      returning id
    `;
    return rows[0]?.id;
  });
}

export async function updateFaq(
  sql: Sql,
  id: string,
  input: FaqInput & { version: number },
  actor: Actor,
) {
  await sql.begin(async (tx) => {
    const result = await tx`
      update content.faq
      set question = ${input.question}, answer = ${input.answer}, published = ${input.published},
        updated_at = now(), updated_by = ${actor.actorId}::uuid, version = version + 1
      where id = ${id}::uuid and version = ${input.version}
    `;
    if (result.count !== 1) {
      const exists = await tx<
        { id: string }[]
      >`select id from content.faq where id = ${id}::uuid`;
      throw new ContentWriteError(exists[0] ? "conflict" : "missing");
    }
    await writeAudit(tx, actor, "content.faq.updated", "faq", id);
  });
}

export async function setContentPublished(
  sql: Sql,
  table: ListTable,
  id: string,
  version: number,
  published: boolean,
  actor: Actor,
) {
  const meta = LIST_ACTIONS[table];
  await sql.begin(async (tx) => {
    if (table === "testimonials" && published) {
      const rows = await tx<{ consent_at: string | null }[]>`
        select consent_at::text as consent_at
        from content.testimonials
        where id = ${id}::uuid
        for update
      `;
      if (!rows[0]) throw new ContentWriteError("missing");
      if (!rows[0].consent_at) throw new ContentWriteError("consent");
    }
    const updated = await tx.unsafe(
      `update content.${table}
       set published = $2, version = version + 1, updated_at = now(), updated_by = $3
       where id = $1 and version = $4`,
      [id, published, actor.actorId, version],
    );
    if (updated.count !== 1) {
      const exists = await tx.unsafe<{ id: string }[]>(
        `select id from content.${table} where id = $1`,
        [id],
      );
      throw new ContentWriteError(exists[0] ? "conflict" : "missing");
    }
    await writeAudit(tx, actor, meta.updated, meta.entity, id);
  });
}

export async function deleteContent(
  sql: Sql,
  table: ListTable,
  id: string,
  actor: Actor,
): Promise<{ removedPaths: string[] }> {
  const meta = LIST_ACTIONS[table];
  return sql.begin(async (tx) => {
    const rows = await tx.unsafe<{ image_path?: string | null }[]>(
      `delete from content.${table} where id = $1 returning ${table === "services" ? "image_path" : "id"}`,
      [id],
    );
    if (rows.length === 0) throw new ContentWriteError("missing");
    await writeAudit(tx, actor, meta.deleted, meta.entity, id);
    const imagePath = table === "services" ? rows[0]?.image_path : null;
    return { removedPaths: imagePath ? [imagePath] : [] };
  });
}

export async function moveContent(
  sql: Sql,
  table: ListTable,
  id: string,
  version: number,
  direction: "up" | "down",
  actor: Actor,
) {
  const meta = LIST_ACTIONS[table];
  await sql.begin(async (tx) => {
    const rows = await tx.unsafe<{ id: string; sort_order: number; version: number }[]>(
      `select id, sort_order, version from content.${table} order by sort_order, id for update`,
    );
    const index = rows.findIndex((row) => row.id === id);
    const current = rows[index];
    const neighbor = rows[index + (direction === "up" ? -1 : 1)];
    if (!current || !neighbor) return;
    if (current.version !== version) throw new ContentWriteError("conflict");
    if (new Set(rows.map((row) => row.sort_order)).size !== rows.length) {
      for (const [position, row] of rows.entries()) {
        row.sort_order = position + 1;
        await tx.unsafe(`update content.${table} set sort_order = $2 where id = $1`, [
          row.id,
          row.sort_order,
        ]);
      }
    }
    const moved = await tx.unsafe(
      `update content.${table} set sort_order = $2, version = version + 1, updated_at = now(), updated_by = $3 where id = $1 and version = $4`,
      [current.id, neighbor.sort_order, actor.actorId, current.version],
    );
    if (moved.count !== 1) throw new ContentWriteError("conflict");
    await tx.unsafe(
      `update content.${table} set sort_order = $2, version = version + 1, updated_at = now(), updated_by = $3 where id = $1`,
      [neighbor.id, current.sort_order, actor.actorId],
    );
    await writeAudit(tx, actor, meta.updated, meta.entity, current.id);
    await writeAudit(tx, actor, meta.updated, meta.entity, neighbor.id);
  });
}

async function insertList(
  sql: Sql,
  table: "testimonials" | "faq",
  actor: Actor,
  insert: (tx: Tx) => Promise<string | undefined>,
) {
  const meta = LIST_ACTIONS[table];
  return sql.begin(async (tx) => {
    const id = await insert(tx);
    if (!id) throw new Error("Falha ao criar o conteúdo.");
    await writeAudit(tx, actor, meta.created, meta.entity, id);
    return id;
  });
}

async function writeAudit(
  tx: Tx,
  actor: Actor,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
) {
  await recordAudit(
    {
      action,
      actorUserId: actor.actorId,
      entityType,
      entityId,
      ip: actor.ip,
      metadata: {},
    },
    tx,
  );
}

async function nextSortOrder(tx: Tx, table: ListTable): Promise<number> {
  const rows = await tx.unsafe<{ sort_order: number }[]>(
    `select sort_order from content.${table} order by sort_order for update`,
  );
  return (rows.at(-1)?.sort_order ?? 0) + 1;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
