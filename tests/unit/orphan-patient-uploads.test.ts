import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_PATH_QUERY,
  ORPHAN_PATIENT_OBJECT_MS,
  parseAttachmentPathRows,
  selectOrphanPatientObjects,
} from "../../scripts/production-backup-lib.mjs";
import {
  deletePrivateObject,
  readAttachmentStoragePaths,
  removeOrphanPatientUploads,
} from "../../scripts/production-backup.mjs";

const KEPT =
  "patients/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf";
const ORPHAN =
  "patients/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.pdf";
const FRESH =
  "patients/55555555-5555-4555-8555-555555555555/66666666-6666-4666-8666-666666666666.pdf";
const UNDATED =
  "patients/77777777-7777-4777-8777-777777777777/88888888-8888-4888-8888-888888888888.pdf";

const env = {
  BACKUP_SUPABASE_URL: "https://backup.example",
  BACKUP_SUPABASE_SERVICE_ROLE_KEY: "service-role-de-teste",
};

describe("anexos enviados e nunca confirmados", () => {
  it("escolhe só patients/ sem registro e com mais de 24 h", () => {
    const now = Date.now();
    expect(ATTACHMENT_PATH_QUERY).toBe(
      "select storage_path from clinic.patient_attachments",
    );
    expect(parseAttachmentPathRows(`${KEPT}\n${ORPHAN}\n`).has(ORPHAN)).toBe(true);
    const registered = new Set([KEPT]);
    const selected = selectOrphanPatientObjects(
      [
        {
          name: KEPT,
          createdAt: new Date(now - ORPHAN_PATIENT_OBJECT_MS - 1000).toISOString(),
        },
        {
          name: ORPHAN,
          createdAt: new Date(now - ORPHAN_PATIENT_OBJECT_MS - 1000).toISOString(),
        },
        { name: FRESH, createdAt: new Date(now - 60 * 60 * 1000).toISOString() },
        { name: UNDATED, createdAt: "" },
        {
          name: "site-public/logo.png",
          createdAt: new Date(now - ORPHAN_PATIENT_OBJECT_MS - 1000).toISOString(),
        },
      ],
      registered,
      now,
    );
    expect(selected).toEqual([ORPHAN]);
  });

  it("não apaga objeto fora de patients/", async () => {
    await expect(
      deletePrivateObject({
        env,
        objectName: "site-public/logo.png",
        fetchImpl: async () => {
          throw new Error("não deveria apagar");
        },
      }),
    ).rejects.toThrow(/patients/);
  });

  it("apaga o órfão antigo e preserva o restante", async () => {
    const now = Date.now();
    const deleted: string[] = [];
    const removed = await removeOrphanPatientUploads({
      env,
      registeredPaths: [KEPT],
      now,
      fetchImpl: async (url, init) => {
        const address = String(url);
        if (init?.method === "DELETE") {
          deleted.push(address);
          return new Response("", { status: 200 });
        }
        const raw = typeof init?.body === "string" ? init.body : "{}";
        const body = JSON.parse(raw) as { prefix?: string };
        if (body.prefix === "patients/") {
          return new Response(
            JSON.stringify([
              {
                name: KEPT,
                id: "1",
                created_at: new Date(now - ORPHAN_PATIENT_OBJECT_MS - 1000).toISOString(),
              },
              {
                name: ORPHAN,
                id: "2",
                created_at: new Date(now - ORPHAN_PATIENT_OBJECT_MS - 1000).toISOString(),
              },
              {
                name: FRESH,
                id: "3",
                created_at: new Date(now - 60 * 60 * 1000).toISOString(),
              },
              { name: UNDATED, id: "4", created_at: "" },
              { name: "patients/pasta", id: null },
            ]),
            { status: 200 },
          );
        }
        return new Response("[]", { status: 200 });
      },
    });
    expect(removed).toBe(1);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain(
      encodeURIComponent("44444444-4444-4444-8444-444444444444.pdf"),
    );
    expect(deleted[0]).not.toContain(KEPT);
  });

  it("não apaga nada quando a consulta vem vazia e há arquivos", async () => {
    const now = Date.now();
    const deleted: string[] = [];
    const old = new Date(now - ORPHAN_PATIENT_OBJECT_MS - 1000).toISOString();
    await expect(
      removeOrphanPatientUploads({
        env,
        registeredPaths: [],
        now,
        fetchImpl: async (_url, init) => {
          if (init?.method === "DELETE") {
            deleted.push(String(_url));
            return new Response("", { status: 200 });
          }
          return new Response(
            JSON.stringify([
              { name: "patients/a/um.pdf", id: "1", created_at: old },
              { name: "patients/b/dois.pdf", id: "2", created_at: old },
              { name: "patients/c/tres.pdf", id: "3", created_at: old },
            ]),
            { status: 200 },
          );
        },
      }),
    ).rejects.toThrow(/Nada foi apagado/);
    expect(deleted).toEqual([]);
  });

  it("apaga um órfão quando há cinquenta objetos", async () => {
    const now = Date.now();
    const old = new Date(now - ORPHAN_PATIENT_OBJECT_MS - 1000).toISOString();
    const objects = Array.from({ length: 50 }, (_, index) => ({
      name: `patients/grupo/arquivo-${index}.pdf`,
      id: String(index),
      created_at: old,
    }));
    const orphan = objects[0]?.name ?? "";
    const registeredPaths = objects.slice(1).map((object) => object.name);
    const deleted: string[] = [];
    const removed = await removeOrphanPatientUploads({
      env,
      registeredPaths,
      now,
      fetchImpl: async (url, init) => {
        if (init?.method === "DELETE") {
          deleted.push(String(url));
          return new Response("", { status: 200 });
        }
        return new Response(JSON.stringify(objects), { status: 200 });
      },
    });
    expect(removed).toBe(1);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain("arquivo-0.pdf");
    expect(orphan).toBe("patients/grupo/arquivo-0.pdf");
  });

  it("consulta os caminhos no banco, inclusive os excluídos", async () => {
    const databaseUrl = "postgres://usuario:segredo-banco@db.example/adrielli";
    const errors: string[] = [];
    const original = console.error;
    console.error = (message?: unknown) => {
      errors.push(String(message));
    };
    try {
      const paths = await readAttachmentStoragePaths({
        env: { BACKUP_DATABASE_URL: databaseUrl },
        spawnImpl: (_binary: string, args: string[]) => {
          expect(args).toContain(ATTACHMENT_PATH_QUERY);
          expect(args.join(" ")).not.toMatch(/deleted_at/);
          return { status: 0, stdout: `${KEPT}\n${ORPHAN}\n` };
        },
      });
      expect([...paths].sort()).toEqual([KEPT, ORPHAN].sort());
      await expect(
        readAttachmentStoragePaths({
          env: { BACKUP_DATABASE_URL: databaseUrl },
          spawnImpl: () => ({ status: 1, stderr: databaseUrl, stdout: "" }),
        }),
      ).rejects.toThrow(/Nada foi apagado/);
    } finally {
      console.error = original;
    }
    expect(errors.join("\n")).not.toContain("segredo-banco");
  });
});
