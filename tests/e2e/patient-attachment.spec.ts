import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import {
  createStaff,
  enrollVerifiedTotp,
  loadLocalEnv,
  ownerSql,
  removeStaff,
  signIn,
  totpCode,
} from "./staff-fixtures";

const patientIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe("anexo na ficha pelo iPhone", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];
  let email = "";
  let secret = "";
  let patientId = "";

  test.beforeAll(async () => {
    email = `anexo-iphone-${crypto.randomUUID()}@example.com`;
    const staffId = await createStaff(email, "CLINIC_ADMIN");
    created.push(staffId);
    secret = await enrollVerifiedTotp(email);
    patientId = await insertPatient(staffId);
  });

  test.afterAll(async () => {
    try {
      if (patientId) await removeCreatedPatient(patientId);
    } finally {
      await Promise.all(created.map((id) => removeStaff(id)));
    }
  });

  test("envia e abre um PDF na mesma aba", async ({ page }) => {
    test.setTimeout(180_000);
    let popped = false;
    page.on("popup", () => {
      popped = true;
    });
    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/, { timeout: 20_000 });
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/consultorio$/, { timeout: 20_000 });

    await page.goto(`/consultorio/pacientes/${patientId}?secao=anexos`);
    await expect(page).toHaveURL(
      new RegExp(`/consultorio/pacientes/${patientId}\\?secao=anexos$`),
    );
    await page.locator("input[name=file]").setInputFiles({
      name: "laudo.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n"),
    });
    await page.getByRole("button", { name: "Enviar anexo" }).click();
    await expect(page.getByText("laudo.pdf")).toBeVisible({ timeout: 20_000 });

    const opened = pdfFromOpen(page);
    await page.getByRole("button", { name: "Abrir" }).click();
    expect((await opened).subarray(0, 5).toString()).toBe("%PDF-");
    expect(popped).toBe(false);
  });
});

function pdfFromOpen(page: Page): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("O anexo não abriu.")), 20_000);
    const finish = (bytes: Buffer) => {
      clearTimeout(timer);
      resolve(bytes);
    };
    page.once("download", async (download) => {
      const saved = await download.path();
      if (!saved) {
        clearTimeout(timer);
        reject(new Error("Download sem arquivo."));
        return;
      }
      finish(readFileSync(saved));
    });
    page.on("response", (response) => {
      if (
        response.request().method() !== "GET" ||
        !response.url().includes("/storage/v1/") ||
        !response.ok()
      ) {
        return;
      }
      void response
        .body()
        .then((body) => {
          if (Buffer.from(body).subarray(0, 5).toString() === "%PDF-")
            finish(Buffer.from(body));
        })
        .catch(() => undefined);
    });
  });
}

async function insertPatient(staffId: string): Promise<string> {
  const sql = ownerSql();
  try {
    return await sql.begin(async (tx) => {
      const patients = await tx<{ id: string }[]>`
        insert into clinic.patients (full_name, birth_date, created_by)
        values ('Anexo Tela', '2018-03-04', ${staffId}::uuid)
        returning id
      `;
      const patient = patients[0]?.id;
      if (!patient) throw new Error("Falha ao gravar o paciente de teste.");
      const guardians = await tx<{ id: string }[]>`
        insert into clinic.guardians (full_name, relationship, phone)
        values ('Responsavel Tela', 'MOTHER', '11988887766')
        returning id
      `;
      const guardian = guardians[0]?.id;
      if (!guardian) throw new Error("Falha ao gravar o responsável de teste.");
      await tx`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${patient}::uuid, ${guardian}::uuid, true)
      `;
      return patient;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function removeCreatedPatient(id: string): Promise<void> {
  if (!patientIdPattern.test(id)) return;
  loadLocalEnv();
  const sql = ownerSql();
  const paths: string[] = [];
  try {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      const files = await tx<{ storage_path: string }[]>`
        select storage_path from clinic.patient_attachments
        where patient_id = ${id}::uuid
      `;
      paths.push(...files.map((row) => row.storage_path));
      await tx`delete from clinic.patient_attachments where patient_id = ${id}::uuid`;
      const guardians = await tx<{ guardian_id: string }[]>`
        select guardian_id from clinic.patient_guardians
        where patient_id = ${id}::uuid
      `;
      await tx`delete from clinic.patient_guardians where patient_id = ${id}::uuid`;
      for (const guardian of guardians) {
        await tx`
          delete from clinic.guardians g
          where g.id = ${guardian.guardian_id}::uuid
            and not exists (
              select 1 from clinic.patient_guardians link
              where link.guardian_id = g.id
            )
        `;
      }
      await tx`delete from clinic.patients where id = ${id}::uuid`;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return;
  for (const path of paths) {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    await fetch(`${url}/storage/v1/object/clinic-private/${encoded}`, {
      method: "DELETE",
      headers: { apikey: service, authorization: `Bearer ${service}` },
    });
  }
}
