import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

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

test.describe("pacotes", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];
  let email = "";
  let secret = "";
  let staffId = "";
  let patientId = "";
  const stamp = crypto.randomUUID().slice(0, 8);
  const patientName = `Pacote Tela ${stamp}`;
  const day = 1 + (Number.parseInt(stamp.slice(0, 2), 16) % 28);
  const date = `2029-08-${String(day).padStart(2, "0")}`;
  const hour = 8 + (Number.parseInt(stamp.slice(2, 4), 16) % 6);
  const startTime = clockHour(hour);

  test.beforeAll(async () => {
    email = `agenda-pacotes-${crypto.randomUUID()}@example.com`;
    staffId = await createStaff(email, "CLINIC_ADMIN");
    created.push(staffId);
    secret = await enrollVerifiedTotp(email);
    patientId = await insertPackagePatient(staffId, patientName);
  });

  test.afterAll(async () => {
    try {
      if (patientId) await removePackagePatient(patientId);
    } finally {
      await Promise.all(created.map((id) => removeStaff(id)));
    }
  });

  test("cria, encerra, série até o limite, liga e desliga, axe", async ({ page }) => {
    test.setTimeout(180_000);
    await signInStaff(page, email, secret);

    await page.goto(`/consultorio/pacientes/${patientId}?secao=sessoes`);
    await expect(page.getByRole("heading", { name: "Pacotes" })).toBeVisible();
    await fillNamed(page, "startsOn", "2029-08-01");
    await fillNamed(page, "expiresOn", "2020-03-04");
    await fillNamed(page, "price", "150,50");
    await fillNamed(page, "notes", "Pacote e2e");
    await fillNamed(page, "totalSessions", "2");
    await page.getByRole("button", { name: "Criar pacote" }).click();
    await expect(page.getByText("usadas 0 de 2")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Pacote vencido em 04/03")).toBeVisible();
    await expect(page.getByText("R$ 150,50")).toBeVisible();
    await expectAxe(page);

    await page.goto(`/consultorio/agenda/nova?paciente=${patientId}&data=${date}`);
    const packageSelect = page.getByLabel("Pacote (opcional)");
    await expect(packageSelect.locator("option")).toHaveCount(2);
    await packageSelect.selectOption({ index: 1 });
    await expect(packageSelect).not.toHaveValue("");
    await page.locator('input[name="date"]').fill(date);
    await page.locator('input[name="time"]').fill(startTime);
    await page.locator('input[name="weeks"]').fill("3");
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page.getByText("1 sessão fica fora do pacote")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar sessões fora do pacote" }).click();
    await expect(page.getByRole("heading", { name: patientName })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Ligada ao pacote de 2/)).toBeVisible();

    const rows = await appointmentPackages(patientId);
    expect(rows, JSON.stringify(rows)).toHaveLength(3);
    expect(
      rows.filter((row) => row.package_id !== null),
      JSON.stringify(rows),
    ).toHaveLength(2);
    const unlinked = rows.find((row) => row.package_id === null);
    const linked = rows.find((row) => row.package_id !== null);
    expect(unlinked && linked).toBeTruthy();

    await page.goto(`/consultorio/agenda/${linked!.id}`);
    await expect(page.getByText(/Ligada ao pacote de 2/)).toBeVisible();
    await page.getByRole("button", { name: "Desligar do pacote" }).click();
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Esta sessão não está ligada a um pacote.")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/consultorio/pacientes/${patientId}?secao=sessoes`);
    await expect(page.getByText("Falta 1 sessão neste pacote.")).toBeVisible();

    await page.goto(`/consultorio/agenda/${unlinked!.id}`);
    await page.getByRole("button", { name: "Ligar ao pacote" }).click();
    await expect(page.getByText(/Ligada ao pacote de 2/)).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/consultorio/pacientes/${patientId}?secao=sessoes`);
    await page.getByRole("button", { name: "Encerrar pacote" }).click();
    await page.getByRole("button", { name: "Confirmar encerramento" }).click();
    await expect(page.getByText("Encerrado")).toBeVisible({ timeout: 15_000 });
    await expectAxe(page);
  });

  test("visão semana não estoura a 1280 px", async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), "A grade da semana entra no projeto desktop.");
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInStaff(page, email, secret);
    await page.goto(`/consultorio/agenda?visao=semana&data=${date}`);
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Semana" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    await expectAxe(page);
  });
});

async function signInStaff(page: Page, email: string, secret: string): Promise<void> {
  await signIn(page, email);
  await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/, { timeout: 20_000 });
  await page.getByLabel("Código").fill(totpCode(secret));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/consultorio$/, { timeout: 20_000 });
}

async function expectAxe(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  const enabled = page.locator("button[data-slot='button']:not([disabled])");
  const count = await enabled.count();
  for (let index = 0; index < count; index += 1) {
    await expect(enabled.nth(index)).toHaveCSS("opacity", "1");
  }
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["document-title"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function overflowX(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

function clockHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

async function fillNamed(page: Page, name: string, value: string): Promise<void> {
  const field = page.locator(`[name="${name}"]`);
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await field.fill(value);
  if ((await field.inputValue()) !== value) {
    await field.evaluate((element, next) => {
      const input = element as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }
  await expect(field).toHaveValue(value);
}

async function appointmentPackages(
  patientId: string,
): Promise<{ id: string; package_id: string | null }[]> {
  const sql = ownerSql();
  try {
    return await sql<{ id: string; package_id: string | null }[]>`
      select id, package_id
      from clinic.appointments
      where patient_id = ${patientId}::uuid
      order by starts_at, id
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function insertPackagePatient(staffId: string, fullName: string): Promise<string> {
  const sql = ownerSql();
  try {
    return await sql.begin(async (tx) => {
      const patients = await tx<{ id: string }[]>`
        insert into clinic.patients (full_name, birth_date, created_by)
        values (${fullName}, '2018-03-04', ${staffId}::uuid)
        returning id
      `;
      const patient = patients[0]?.id;
      if (!patient) throw new Error("Falha ao gravar o paciente de teste.");
      const guardians = await tx<{ id: string }[]>`
        insert into clinic.guardians (full_name, relationship, phone)
        values ('Responsavel Pacote', 'MOTHER', '11988887766')
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

async function removePackagePatient(id: string): Promise<void> {
  if (!patientIdPattern.test(id)) return;
  loadLocalEnv();
  const sql = ownerSql();
  try {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`
        update clinic.appointments
        set rescheduled_to_id = null, makeup_of_id = null
        where patient_id = ${id}::uuid
      `;
      await tx`delete from clinic.appointments where patient_id = ${id}::uuid`;
      await tx`delete from clinic.packages where patient_id = ${id}::uuid`;
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
