import { expect, test } from "@playwright/test";

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

test("a coluna do rodapé e o diálogo de confirmação passam de 300 px a 1280 px", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const footerHeading = page
    .getByRole("contentinfo")
    .getByText("A etapa 1 começa com uma mensagem.");
  await expect(footerHeading).toBeVisible();
  const footerColumn = footerHeading.locator("xpath=..");
  const footerBox = await footerColumn.boundingBox();
  expect(footerBox).not.toBeNull();
  if (footerBox) expect(footerBox.width).toBeGreaterThan(300);

  const email = `largura-${crypto.randomUUID()}@example.com`;
  const userId = await createStaff(email, "SUPER_ADMIN");
  const secret = await enrollVerifiedTotp(email);
  const patientId = await insertPatient(userId);
  try {
    await signIn(page, email);
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();

    await page.goto(`/consultorio/pacientes/${patientId}`);
    await page.getByRole("button", { name: "Arquivar" }).click();
    const clinicConfirm = page.locator("form").filter({
      hasText: "Arquivar tira o paciente da lista de ativos",
    });
    await expect(clinicConfirm).toBeVisible();
    const clinicBox = await clinicConfirm.boundingBox();
    expect(clinicBox).not.toBeNull();
    if (clinicBox) expect(clinicBox.width).toBeGreaterThan(300);

    await page.goto("/admin/usuarios");
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
    await page.getByRole("button", { name: "Alterar papéis" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Alterar papéis" });
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    if (dialogBox) expect(dialogBox.width).toBeGreaterThan(300);
  } finally {
    try {
      await removeCreatedPatient(patientId);
    } finally {
      await removeStaff(userId);
    }
  }
});

async function insertPatient(staffId: string): Promise<string> {
  const sql = ownerSql();
  try {
    return await sql.begin(async (tx) => {
      const patients = await tx<{ id: string }[]>`
        insert into clinic.patients (full_name, birth_date, created_by)
        values ('Largura Tema', '2018-03-04', ${staffId}::uuid)
        returning id
      `;
      const patient = patients[0]?.id;
      if (!patient) throw new Error("Falha ao gravar o paciente de teste.");
      const guardians = await tx<{ id: string }[]>`
        insert into clinic.guardians (full_name, relationship, phone)
        values ('Responsavel Largura', 'MOTHER', '11988887766')
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
  try {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
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
}
