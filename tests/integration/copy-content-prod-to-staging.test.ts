import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import {
  readContent,
  readProtectedCounts,
  writeContent,
} from "../../scripts/copy-content-prod-to-staging.mjs";

const ACTOR = "55555555-5555-4555-8555-555555555555";
const SEED_STEPS = [
  { title: "Contato", body: "" },
  { title: "Avaliação", body: "" },
  { title: "Atendimento", body: "" },
  { title: "Acompanhamento", body: "" },
];
const ORIGIN_STEPS = [
  { title: "Primeiro", body: "um" },
  { title: "Segundo", body: "dois" },
  { title: "Terceiro", body: "tres" },
];
const DEST_STEPS = [
  { title: "Alpha", body: "destino" },
  { title: "Beta", body: "destino" },
  { title: "Gamma", body: "destino" },
  { title: "Delta", body: "destino" },
];

type ContentRow = Record<string, unknown>;
type ContentTables = {
  site_settings: ContentRow[];
  services: ContentRow[];
  testimonials: ContentRow[];
  faq: ContentRow[];
};

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return value;
}

function pick(row: ContentRow, keys: string[]) {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      key === "consent_at" ? dateOnly(row[key]) : (row[key] ?? null),
    ]),
  );
}

function listFields(rows: ContentRow[], keys: string[]) {
  return rows.map((row) => pick(row, keys));
}

describe("cópia do conteúdo público no banco de teste", () => {
  let owner: ReturnType<typeof postgres>;
  let originTables: ContentTables;
  let destServiceId: string;
  const originServiceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const originTestimonialId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const originFaqId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    await owner`insert into auth.users (id) values (${ACTOR}::uuid)`;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${ACTOR}::uuid, 'STAFF', 'copia-conteudo@example.com', 'Cópia')
    `;
  });

  beforeEach(async () => {
    destServiceId = crypto.randomUUID();
    await owner`truncate content.services, content.testimonials, content.faq`;
    await owner`
      update content.site_settings
      set hero_title = 'Origem da copia',
        how_it_works = ${owner.json(ORIGIN_STEPS)},
        updated_by = ${ACTOR}::uuid
      where id = 1
    `;
    await owner`
      insert into content.services (
        id, title, slug, summary, body, published, sort_order, updated_by
      )
      values (
        ${originServiceId}::uuid,
        'Serviço origem',
        'servico-origem',
        'Resumo origem',
        'Corpo origem',
        true,
        2,
        ${ACTOR}::uuid
      )
    `;
    await owner`
      insert into content.testimonials (
        id, quote, author_label, consent_at, published, sort_order, updated_by
      )
      values (
        ${originTestimonialId}::uuid,
        'Depoimento origem',
        'Família origem',
        '2026-10-23',
        true,
        1,
        ${ACTOR}::uuid
      )
    `;
    await owner`
      insert into content.faq (
        id, question, answer, published, sort_order, updated_by
      )
      values (
        ${originFaqId}::uuid,
        'Pergunta origem?',
        'Resposta origem',
        true,
        3,
        ${ACTOR}::uuid
      )
    `;
    originTables = await readContent(owner);

    await owner`
      update content.site_settings
      set hero_title = 'Destino atual',
        how_it_works = ${owner.json(DEST_STEPS)},
        updated_by = null
      where id = 1
    `;
    await owner`
      insert into content.services (id, title, slug, summary, body, published, sort_order)
      values (
        ${destServiceId}::uuid,
        'Serviço destino',
        'servico-destino',
        'Resumo destino',
        'Corpo destino',
        false,
        9
      )
    `;
  });

  afterAll(async () => {
    await owner`truncate content.services, content.testimonials, content.faq`;
    await owner`
      update content.site_settings
      set hero_title = '',
        how_it_works = ${owner.json(SEED_STEPS)},
        updated_by = null
      where id = 1
    `;
    await owner`delete from identity.users where id = ${ACTOR}::uuid`;
    await owner`delete from auth.users where id = ${ACTOR}::uuid`;
    await owner?.end({ timeout: 5 });
  });

  it("grava how_it_works como array e replica serviços, perguntas e depoimentos", async () => {
    await writeContent(owner, originTables);

    const copied = await owner<{ kind: string; steps: unknown }[]>`
      select jsonb_typeof(how_it_works) as kind, how_it_works as steps
      from content.site_settings
      where id = 1
    `;
    expect(copied).toEqual([{ kind: "array", steps: ORIGIN_STEPS }]);
    expect(copied[0]?.steps).toEqual(ORIGIN_STEPS);

    const dest = await readContent(owner);
    expect(dest.site_settings[0]?.hero_title).toBe("Origem da copia");
    expect(dest.site_settings[0]?.updated_by).toBeNull();
    expect(dest.site_settings[0]?.how_it_works).toEqual(ORIGIN_STEPS);

    expect(
      listFields(dest.services, [
        "id",
        "title",
        "slug",
        "summary",
        "body",
        "published",
        "sort_order",
        "updated_by",
      ]),
    ).toEqual([
      {
        id: originServiceId,
        title: "Serviço origem",
        slug: "servico-origem",
        summary: "Resumo origem",
        body: "Corpo origem",
        published: true,
        sort_order: 2,
        updated_by: null,
      },
    ]);
    expect(
      listFields(dest.testimonials, [
        "id",
        "quote",
        "author_label",
        "consent_at",
        "published",
        "sort_order",
        "updated_by",
      ]),
    ).toEqual([
      {
        id: originTestimonialId,
        quote: "Depoimento origem",
        author_label: "Família origem",
        consent_at: "2026-10-23",
        published: true,
        sort_order: 1,
        updated_by: null,
      },
    ]);
    expect(
      listFields(dest.faq, [
        "id",
        "question",
        "answer",
        "published",
        "sort_order",
        "updated_by",
      ]),
    ).toEqual([
      {
        id: originFaqId,
        question: "Pergunta origem?",
        answer: "Resposta origem",
        published: true,
        sort_order: 3,
        updated_by: null,
      },
    ]);
    expect(dest.services.some((row) => row.id === destServiceId)).toBe(false);
  });

  it("aborta how_it_works inválido sem alterar o destino", async () => {
    const beforeContent = await readContent(owner);
    const beforeCounts = await readProtectedCounts(owner);
    const beforeSettings = await owner<{ hero_title: string; kind: string }[]>`
      select hero_title, jsonb_typeof(how_it_works) as kind
      from content.site_settings
      where id = 1
    `;
    const beforeServices = await owner<{ id: string; title: string }[]>`
      select id, title from content.services order by title
    `;

    const invalid = {
      ...originTables,
      site_settings: originTables.site_settings.map((row) => ({
        ...row,
        how_it_works: [{ title: "Só uma", body: "etapa" }],
      })),
    };

    await expect(writeContent(owner, invalid)).rejects.toThrow(
      /site_settings_how_it_works_count/,
    );

    const afterContent = await readContent(owner);
    const afterCounts = await readProtectedCounts(owner);
    const afterSettings = await owner<{ hero_title: string; kind: string }[]>`
      select hero_title, jsonb_typeof(how_it_works) as kind
      from content.site_settings
      where id = 1
    `;
    const afterServices = await owner<{ id: string; title: string }[]>`
      select id, title from content.services order by title
    `;

    expect(afterSettings).toEqual([{ hero_title: "Destino atual", kind: "array" }]);
    expect(afterSettings).toEqual(beforeSettings);
    expect(afterContent.site_settings[0]?.how_it_works).toEqual(DEST_STEPS);
    expect(afterContent.site_settings[0]?.hero_title).toBe(
      beforeContent.site_settings[0]?.hero_title,
    );
    expect(afterServices).toEqual(beforeServices);
    expect(afterServices.some((row) => row.id === destServiceId)).toBe(true);
    expect(afterContent.faq).toEqual(beforeContent.faq);
    expect(afterContent.testimonials).toEqual(beforeContent.testimonials);
    expect(afterCounts).toEqual(beforeCounts);
  });
});
