import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/identity/server/guard", () => ({
  assertRole: async () => {},
  requireStaff: async () => {
    throw new Error("requireStaff");
  },
  StaffAccessError: class StaffAccessError extends Error {
    reason = "forbidden";
  },
}));

import { TEST_DATABASE_NAME } from "../../src/db/seed";
import { readUploadReceipt } from "../../src/modules/clinic/attachment-receipt";
import {
  confirmAttachmentUpload,
  openAttachment,
  prepareAttachmentUpload,
} from "../../src/modules/clinic/attachments";
import { ATTACHMENT_MAX_BYTES, sha256Hex } from "../../src/modules/clinic/file-bytes";
import {
  ClinicRuleError,
  createPatient,
  type Actor,
} from "../../src/modules/clinic/patients";
import {
  clinicObjectStore,
  type ClinicObjectStore,
} from "../../src/modules/clinic/storage";

const STAFF_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";
const ACTOR: Actor = { userId: STAFF_ID, ip: null };
const MARKER = "GPS-MARKER-99";

describe("anexos no storage local", () => {
  let owner: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let store: ClinicObjectStore;
  let secret = "";
  let patientId = "";
  const paths: string[] = [];

  beforeAll(async () => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    const testUrl = process.env.TEST_DATABASE_URL;
    const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    secret = process.env.STAFF_SESSION_SECRET ?? "";
    if (!testUrl || !migrationsUrl || !supabaseUrl || !serviceRoleKey || !secret) {
      throw new Error("Recusado: storage local ausente.");
    }
    const ownerUrl = new URL(migrationsUrl);
    ownerUrl.pathname = `/${TEST_DATABASE_NAME}`;
    owner = postgres(ownerUrl.toString(), { max: 1, prepare: false, connect_timeout: 5 });
    runtime = postgres(testUrl, { max: 1, prepare: false, connect_timeout: 5 });
    store = clinicObjectStore({ supabaseUrl, serviceRoleKey });
    await owner`
      insert into auth.users (id) values (${STAFF_ID}::uuid)
      on conflict (id) do nothing
    `;
    await owner`
      insert into identity.users (id, kind, email, display_name)
      values (${STAFF_ID}::uuid, 'STAFF', 'clinic-attachments@example.com', 'Staff')
      on conflict (id) do nothing
    `;
    patientId = await createPatient(runtime, ACTOR, {
      fullName: "Anexo Prova",
      preferredName: null,
      birthDate: "2017-04-05",
      cpf: null,
      school: null,
      schoolGrade: null,
      referralSource: null,
      notes: null,
      addressText: null,
      confirmDuplicate: false,
      guardian: {
        fullName: "Responsavel Prova",
        relationship: "MOTHER",
        phone: "11987654329",
        email: null,
        cpf: null,
        receivesReminders: false,
      },
    });
  });

  afterAll(async () => {
    for (const path of paths) await store.remove(path);
    const patients = await owner<{ id: string }[]>`
      select id from clinic.patients where created_by = ${STAFF_ID}::uuid
    `;
    const patientIds = patients.map((row) => row.id);
    if (patientIds.length > 0) {
      await owner`alter table clinic.patient_guardians disable trigger "patient_guardians_keep_one"`;
      try {
        const guardians = await owner<{ guardian_id: string }[]>`
          select guardian_id from clinic.patient_guardians
          where patient_id in ${owner(patientIds)}
        `;
        await owner`delete from clinic.patient_attachments where patient_id in ${owner(patientIds)}`;
        await owner`delete from clinic.patient_guardians where patient_id in ${owner(patientIds)}`;
        await owner`delete from clinic.patients where id in ${owner(patientIds)}`;
        const guardianIds = guardians.map((row) => row.guardian_id);
        if (guardianIds.length > 0) {
          await owner`delete from clinic.guardians where id in ${owner(guardianIds)}`;
        }
      } finally {
        await owner`alter table clinic.patient_guardians enable trigger "patient_guardians_keep_one"`;
      }
    }
    await owner`delete from identity.users where id = ${STAFF_ID}::uuid`;
    await owner`delete from auth.users where id = ${STAFF_ID}::uuid`;
    await owner.end({ timeout: 5 });
    await runtime.end({ timeout: 5 });
  });

  it("confirma PDF e JPEG, remove o EXIF e grava a auditoria", async () => {
    const pdf = new Uint8Array(Buffer.from("%PDF-1.4\n"));
    const pdfReceipt = await send(pdf, "application/pdf", "laudo.pdf");
    await confirmAttachmentUpload(runtime, ACTOR, store, secret, {
      receipt: pdfReceipt,
      originalName: "laudo.pdf",
      category: "CLINICAL_REPORT",
      now: Date.now(),
    });

    const dirty = await jpegWithGps();
    expect(Buffer.from(dirty).includes(Buffer.from(MARKER))).toBe(true);
    expect((await sharp(dirty).metadata()).exif).toBeDefined();
    const jpegReceipt = await send(dirty, "image/jpeg", "foto.jpg");
    await confirmAttachmentUpload(runtime, ACTOR, store, secret, {
      receipt: jpegReceipt,
      originalName: "foto.jpg",
      category: "CLINICAL_REPORT",
      now: Date.now(),
    });
    const jpegPath = pathOf(jpegReceipt);
    const stored = await store.read(jpegPath);
    expect(stored).not.toBeNull();
    expect(Buffer.from(stored ?? []).includes(Buffer.from(MARKER))).toBe(false);
    expect((await sharp(stored ?? new Uint8Array()).metadata()).exif).toBeUndefined();
    const jpegRow = await runtime<{ sha256: string }[]>`
      select sha256 from clinic.patient_attachments where storage_path = ${jpegPath}
    `;
    const jpegSha = sha256Hex(stored ?? new Uint8Array());
    expect(jpegRow[0]?.sha256).toBe(jpegSha);

    await expect(
      confirmAttachmentUpload(runtime, ACTOR, store, secret, {
        receipt: jpegReceipt,
        originalName: "foto.jpg",
        category: "CLINICAL_REPORT",
        now: Date.now(),
      }),
    ).rejects.toMatchObject({ code: "already-confirmed" });
    const jpegAfter = await store.read(jpegPath);
    expect(sha256Hex(jpegAfter ?? new Uint8Array())).toBe(jpegSha);

    await expect(
      confirmAttachmentUpload(runtime, ACTOR, store, secret, {
        receipt: pdfReceipt,
        originalName: "laudo.pdf",
        category: "CLINICAL_REPORT",
        now: Date.now(),
      }),
    ).rejects.toMatchObject({ code: "already-confirmed" });
    expect(await store.read(pathOf(pdfReceipt))).not.toBeNull();
    const rows = await runtime<{ total: number }[]>`
      select count(*)::int as total
      from clinic.patient_attachments
      where storage_path = ${pathOf(pdfReceipt)}
    `;
    expect(rows[0]?.total).toBe(1);

    const pdfId = await attachmentId(pathOf(pdfReceipt));
    const url = await openAttachment(runtime, ACTOR, store, pdfId);
    const opened = await fetch(url);
    expect(opened.ok).toBe(true);
    expect(
      Buffer.from(await opened.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");

    const audit = await runtime<{ action: string; metadata: unknown }[]>`
      select action, metadata
      from audit.audit_log
      where entity_id = ${pdfId}::uuid
        and action in ('clinic.attachment.uploaded', 'clinic.attachment.downloaded')
      order by action
    `;
    expect(audit.map((row) => row.action)).toEqual([
      "clinic.attachment.downloaded",
      "clinic.attachment.uploaded",
    ]);
    expect(audit.every((row) => JSON.stringify(row.metadata) === "{}")).toBe(true);
  });

  it("apaga do bucket um tipo falso e um arquivo acima de 10 MB", async () => {
    const fake = new Uint8Array(Buffer.from("isto nao e um pdf"));
    const fakeReceipt = await send(fake, "application/pdf", "falso.pdf");
    await expect(
      confirmAttachmentUpload(runtime, ACTOR, store, secret, {
        receipt: fakeReceipt,
        originalName: "falso.pdf",
        category: "CLINICAL_REPORT",
        now: Date.now(),
      }),
    ).rejects.toBeInstanceOf(ClinicRuleError);
    expect(await store.read(pathOf(fakeReceipt))).toBeNull();

    await withLargerBucket(async () => {
      const tooBig = new Uint8Array(ATTACHMENT_MAX_BYTES + 1);
      tooBig.set([0x25, 0x50, 0x44, 0x46], 0);
      const bigReceipt = await send(tooBig, "application/pdf", "grande.pdf");
      await expect(
        confirmAttachmentUpload(runtime, ACTOR, store, secret, {
          receipt: bigReceipt,
          originalName: "grande.pdf",
          category: "CLINICAL_REPORT",
          now: Date.now(),
        }),
      ).rejects.toMatchObject({ code: "size" });
      expect(await store.read(pathOf(bigReceipt))).toBeNull();
    });
  });

  it("o link de abertura expira em 60 segundos", async () => {
    const pdf = new Uint8Array(Buffer.from("%PDF-1.4\n"));
    const receipt = await send(pdf, "application/pdf", "prazo.pdf");
    await confirmAttachmentUpload(runtime, ACTOR, store, secret, {
      receipt,
      originalName: "prazo.pdf",
      category: "CLINICAL_REPORT",
      now: Date.now(),
    });
    const url = await openAttachment(
      runtime,
      ACTOR,
      store,
      await attachmentId(pathOf(receipt)),
    );
    const token = new URL(url).searchParams.get("token") ?? "";
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { exp?: number };
    const exp = payload.exp ?? 0;
    const remainingMs = exp * 1000 - Date.now();
    expect(remainingMs).toBeGreaterThan(30_000);
    expect(remainingMs).toBeLessThanOrEqual(60_000);
    expect((await fetch(url)).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, remainingMs + 2_000));
    expect((await fetch(url, { cache: "no-store" })).ok).toBe(false);
  }, 90_000);

  async function send(
    bytes: Uint8Array,
    mime: "application/pdf" | "image/jpeg",
    name: string,
  ): Promise<string> {
    const prepared = await prepareAttachmentUpload(
      runtime,
      ACTOR,
      store,
      secret,
      { patientId, mime, size: Math.min(bytes.byteLength, ATTACHMENT_MAX_BYTES) },
      Date.now(),
    );
    const path = pathOf(prepared.receipt);
    paths.push(path);
    const upload = await fetch(prepared.signedUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${prepared.token}`,
        "Content-Type": mime,
        "x-upsert": "false",
      },
      body: Buffer.from(bytes),
    });
    if (!upload.ok) throw new Error(`Falha ao enviar ${name}: HTTP ${upload.status}`);
    return prepared.receipt;
  }

  function pathOf(receipt: string): string {
    return readUploadReceipt(secret, receipt, Date.now() + 60_000)?.path ?? "";
  }

  async function attachmentId(path: string): Promise<string> {
    const rows = await runtime<{ id: string }[]>`
      select id from clinic.patient_attachments where storage_path = ${path}
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("Anexo não gravado.");
    return id;
  }
});

async function jpegWithGps(): Promise<Uint8Array> {
  const bytes = await sharp({
    create: { width: 16, height: 12, channels: 3, background: { r: 12, g: 24, b: 36 } },
  })
    .jpeg()
    .withMetadata({
      exif: {
        IFD0: { ImageDescription: MARKER },
        GPS: {
          GPSLatitudeRef: "S",
          GPSLatitude: "23/1 34/1 0/1",
          GPSLongitudeRef: "W",
          GPSLongitude: "46/1 38/1 0/1",
        },
      } as never,
    })
    .toBuffer();
  return new Uint8Array(bytes);
}

async function withLargerBucket(run: () => Promise<void>): Promise<void> {
  const migrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
  if (!migrationsUrl) throw new Error("MIGRATIONS_DATABASE_URL ausente.");
  const owner = postgres(migrationsUrl, { max: 1, prepare: false, connect_timeout: 5 });
  const current = await owner<{ file_size_limit: string | number | null }[]>`
    select file_size_limit from storage.buckets where id = 'clinic-private'
  `;
  const previous = current[0]?.file_size_limit;
  await owner`
    update storage.buckets
    set file_size_limit = ${ATTACHMENT_MAX_BYTES + 1024}
    where id = 'clinic-private'
  `;
  try {
    await run();
  } finally {
    if (previous != null) {
      await owner`
        update storage.buckets
        set file_size_limit = ${previous}
        where id = 'clinic-private'
      `;
    }
    await owner.end({ timeout: 5 });
  }
}
