import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_DATABASE_NAME } from "../../src/db/seed";

const TABLES = ["site_settings", "services", "testimonials", "faq"] as const;
const PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

describe("tabelas de conteúdo", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    if (!testUrl || !migrationsUrl) throw new Error("Recusado: URLs de teste ausentes.");
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
  });

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
    await runtime?.end({ timeout: 5 });
  });

  it("nega leitura e escrita de content a anon e authenticated", async () => {
    const grants = await owner<{ grantee: string }[]>`
      select grantee
      from information_schema.role_table_grants
      where table_schema = 'content'
        and grantee in ('anon', 'authenticated', 'PUBLIC')
    `;
    expect(grants).toEqual([]);

    for (const role of ["anon", "authenticated"]) {
      for (const table of TABLES) {
        for (const statement of [
          `SELECT 1 FROM content.${table}`,
          `INSERT INTO content.${table} DEFAULT VALUES`,
          `UPDATE content.${table} SET version = version WHERE false`,
          `DELETE FROM content.${table} WHERE false`,
        ]) {
          await expect(
            owner.begin(async (transaction) => {
              await transaction.unsafe(`SET LOCAL ROLE ${role}`);
              await transaction.unsafe(statement);
            }),
          ).rejects.toThrow(/permission denied|permissão negada/i);
        }
      }
    }
  });

  it("dá ao app_runtime só select, insert, update e delete", async () => {
    for (const table of TABLES) {
      const grants = await owner<{ privilege_type: string }[]>`
        select privilege_type
        from information_schema.role_table_grants
        where table_schema = 'content'
          and table_name = ${table}
          and grantee = 'app_runtime'
        order by privilege_type
      `;
      expect(grants.map((row) => row.privilege_type)).toEqual([...PRIVILEGES].sort());
    }

    const id = crypto.randomUUID();
    await runtime`
      insert into content.services (id, title, slug, summary, body)
      values (${id}::uuid, 'Avaliação', ${`avaliacao-${id}`}, 'Resumo', 'Texto')
    `;
    const updated = await runtime`
      update content.services set title = 'Avaliação inicial' where id = ${id}::uuid
    `;
    expect(updated.count).toBe(1);
    const removed = await runtime`
      delete from content.services where id = ${id}::uuid
    `;
    expect(removed.count).toBe(1);
  });

  it("grava uma linha de configuração e recusa depoimento publicado sem consentimento", async () => {
    const settings = await runtime<{ steps: number; address: string | null }[]>`
      select jsonb_array_length(how_it_works) as steps, address_text as address
      from content.site_settings
    `;
    expect(settings).toEqual([{ steps: 4, address: null }]);

    await expect(
      owner`insert into content.site_settings (id) values (1)`,
    ).rejects.toThrow(/duplicate key|site_settings_id_singleton/i);
    await expect(
      owner`insert into content.site_settings (id) values (2)`,
    ).rejects.toThrow(/site_settings_id_singleton/);
    await expect(
      owner`update content.site_settings set how_it_works = '[]'::jsonb where id = 1`,
    ).rejects.toThrow(/site_settings_how_it_works_count/);

    await expect(
      owner`
        insert into content.testimonials (quote, author_label, published)
        values ('Um relato', 'Mãe do Pedro', true)
      `,
    ).rejects.toThrow(/testimonials_published_requires_consent/);

    const hidden = await runtime<{ id: string }[]>`
      insert into content.testimonials (quote, author_label, published)
      values ('Um relato', 'Mãe do Pedro', false)
      returning id
    `;
    const published = await runtime<{ id: string }[]>`
      insert into content.testimonials (quote, author_label, consent_at, published)
      values ('Outro relato', 'Mãe do Pedro', '2026-10-23', true)
      returning id
    `;
    const ids = [hidden[0]?.id, published[0]?.id].filter((id) => id !== undefined);
    await owner`delete from content.testimonials where id in ${owner(ids)}`;

    await runtime`
      insert into audit.audit_log (action, metadata)
      values ('content.site.updated', '{}'::jsonb)
    `;
    await expect(
      runtime`
        insert into audit.audit_log (action, metadata)
        values ('content.unknown', '{}'::jsonb)
      `,
    ).rejects.toThrow(/audit_log_action_check/);
  });
});
