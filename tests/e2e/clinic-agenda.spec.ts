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

test.describe("agenda no iPhone", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];
  let email = "";
  let secret = "";
  let staffId = "";
  let patientId = "";
  let settingsSnapshot: AgendaSettingsSnapshot | null = null;
  const stamp = crypto.randomUUID().slice(0, 8);
  const patientName = `Agenda Tela ${stamp}`;
  const day = 1 + (Number.parseInt(stamp.slice(0, 2), 16) % 28);
  const date = `2029-07-${String(day).padStart(2, "0")}`;
  const nextWeek = nextWeekDate(date);
  const hour = 8 + (Number.parseInt(stamp.slice(2, 4), 16) % 6);
  const startTime = clockHour(hour);
  const rescheduleTime = clockHour(hour + 2);
  const makeupTime = clockHour(hour + 3);
  const seriesTime = clockHour(hour + 5);

  test.beforeAll(async () => {
    email = `agenda-iphone-${crypto.randomUUID()}@example.com`;
    staffId = await createStaff(email, "CLINIC_ADMIN");
    created.push(staffId);
    secret = await enrollVerifiedTotp(email);
    patientId = await insertAgendaPatient(staffId, patientName);
    settingsSnapshot = await snapshotAgendaSettings();
  });

  test.afterAll(async () => {
    try {
      if (patientId) await removeAgendaPatient(patientId);
      await restoreAgendaSettings(settingsSnapshot);
    } finally {
      await Promise.all(created.map((id) => removeStaff(id)));
    }
  });

  test("cria sessão, série com conflito, status, remarca, reposição, desfaz e passa no axe", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/, { timeout: 20_000 });
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/consultorio$/, { timeout: 20_000 });

    await page.goto("/consultorio/agenda?data=2030-01-02");
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
    await expect(page.getByText("Nenhuma sessão neste dia")).toBeVisible();
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    await expectAxe(page);
    await page.getByRole("link", { name: "Semana" }).click();
    await page.getByRole("link", { name: "Próximos 14 dias" }).click();
    await page.getByRole("link", { name: "Dia", exact: true }).click();

    await page.getByRole("link", { name: "Nova sessão" }).click();
    await expect(page.getByRole("heading", { name: "Nova sessão" })).toBeVisible();
    await page.getByLabel("Buscar paciente").fill(patientName);
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("link", { name: patientName }).click();
    await expect(page.getByText(patientName)).toBeVisible();
    await expect(page.locator('select[name="packageId"] option').nth(1)).toContainText(
      "Pacote vencido em 04/03",
    );
    await page.getByLabel("Pacote (opcional)").selectOption({ index: 1 });
    await expect(
      page.getByText("Pacote vencido em 04/03", { exact: true }),
    ).toBeVisible();
    await page.locator('input[name="date"]').fill(date);
    await page.locator('input[name="time"]').fill(startTime);
    await expectAxe(page);
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page.getByRole("heading", { name: patientName })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Realizada" })).toBeVisible();
    const firstUrl = page.url();
    await expectAxe(page);
    await page.goto(`/consultorio/agenda?data=${date}`);
    await expect(page.getByText(patientName)).toBeVisible();
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    await page.goto(firstUrl);

    await page.getByRole("button", { name: "Realizada" }).click();
    await expect(page.getByRole("button", { name: "Desfazer" })).toBeVisible();
    await page.getByRole("button", { name: "Desfazer" }).click();
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("button", { name: "Realizada" })).toBeVisible();

    await page.getByRole("link", { name: "Remarcar" }).click();
    await page.locator('input[name="time"]').fill(rescheduleTime);
    await page.getByRole("button", { name: "Remarcar" }).click();
    await page.getByRole("button", { name: "Confirmar remarcação" }).click();
    await expect(page).toHaveURL(/\/consultorio\/agenda\/[0-9a-f-]{36}$/, {
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Faltou (avisou)" })).toBeVisible();
    await expect(page.getByText(rescheduleTime)).toBeVisible();

    await page.getByRole("button", { name: "Faltou (avisou)" }).click();
    await expect(page.getByRole("link", { name: "Agendar reposição" })).toBeVisible({
      timeout: 20_000,
    });
    await page.goto(`/consultorio/pacientes/${patientId}?secao=sessoes`);
    await expect(page.getByRole("heading", { name: "Pacotes" })).toBeVisible();
    await expect(page.getByText("usadas 0 de 10")).toBeVisible();
    await expect(page.getByText("1 reposição pendente")).toBeVisible();
    await expect(page.getByText("Pacote vencido em 04/03")).toBeVisible();
    await expectAxe(page);

    await page.getByRole("link").filter({ hasText: "Faltou (avisou)" }).click();
    await page.getByRole("link", { name: "Agendar reposição" }).click();
    await expect(page.getByRole("heading", { name: "Agendar reposição" })).toBeVisible();
    await page.locator('input[name="date"]').fill(nextWeek);
    await page.locator('input[name="time"]').fill(makeupTime);
    await page.getByRole("button", { name: "Agendar reposição" }).click();
    await expect(page).toHaveURL(/\/consultorio\/agenda\/[0-9a-f-]{36}$/, {
      timeout: 20_000,
    });
    await expect(page.getByText("Reposição", { exact: true })).toBeVisible();
    await expect(page.getByText(makeupTime)).toBeVisible();

    const beforeSeries = await appointmentCount(patientId);
    await page.goto(`/consultorio/agenda/nova?paciente=${patientId}&data=${date}`);
    await page.locator('input[name="date"]').fill(date);
    await page.locator('input[name="time"]').fill(seriesTime);
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page.getByRole("heading", { name: patientName })).toBeVisible({
      timeout: 20_000,
    });
    await page.goto(`/consultorio/agenda/nova?paciente=${patientId}&data=${date}`);
    await page.locator('input[name="date"]').fill(date);
    await page.locator('input[name="time"]').fill(seriesTime);
    await page.getByLabel("Repetir semanalmente por N semanas").fill("2");
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(
      page.getByText("Há horários com conflito. Nada foi criado."),
    ).toBeVisible();
    expect(await appointmentCount(patientId)).toBe(beforeSeries + 1);
    await page.getByRole("button", { name: "Criar só as livres" }).click();
    await expect(page.getByRole("heading", { name: patientName })).toBeVisible({
      timeout: 20_000,
    });
    expect(await appointmentCount(patientId)).toBe(beforeSeries + 2);

    await page.goto("/consultorio/agenda/configuracoes");
    await page.getByLabel("Local").fill("Sala 1");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Configurações salvas.")).toBeVisible();
    await expectAxe(page);

    await page.goto(firstUrl);
    expect(firstUrl).toContain("/consultorio/agenda/");
  });
});

async function expectAxe(page: Page): Promise<void> {
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

function nextWeekDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 7));
  const nextYear = String(next.getUTCFullYear());
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(next.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

async function appointmentCount(patientId: string): Promise<number> {
  const sql = ownerSql();
  try {
    const rows = await sql<{ total: number }[]>`
      select count(*)::int as total
      from clinic.appointments
      where patient_id = ${patientId}::uuid
    `;
    return rows[0]?.total ?? 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function insertAgendaPatient(staffId: string, fullName: string): Promise<string> {
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
        values ('Responsavel Agenda', 'MOTHER', '11988887766')
        returning id
      `;
      const guardian = guardians[0]?.id;
      if (!guardian) throw new Error("Falha ao gravar o responsável de teste.");
      await tx`
        insert into clinic.patient_guardians (patient_id, guardian_id, is_primary)
        values (${patient}::uuid, ${guardian}::uuid, true)
      `;
      await tx`
        insert into clinic.packages (
          patient_id, total_sessions, starts_on, expires_on, price_cents
        )
        values (${patient}::uuid, 10, '2029-01-01', '2020-03-04', 0)
      `;
      return patient;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function removeAgendaPatient(id: string): Promise<void> {
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

type AgendaSettingsSnapshot = {
  default_duration_minutes: number;
  location_name: string;
  location_address: string;
  reminder_send_hour: number;
  updated_by: string | null;
};

async function snapshotAgendaSettings(): Promise<AgendaSettingsSnapshot | null> {
  const sql = ownerSql();
  try {
    const rows = await sql<AgendaSettingsSnapshot[]>`
      select
        default_duration_minutes,
        location_name,
        location_address,
        reminder_send_hour,
        updated_by
      from clinic.settings
      where id = 1
    `;
    return rows[0] ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function restoreAgendaSettings(
  snapshot: AgendaSettingsSnapshot | null,
): Promise<void> {
  if (!snapshot) return;
  const sql = ownerSql();
  try {
    await sql`
      update clinic.settings
      set
        default_duration_minutes = ${snapshot.default_duration_minutes},
        location_name = ${snapshot.location_name},
        location_address = ${snapshot.location_address},
        reminder_send_hour = ${snapshot.reminder_send_hour},
        updated_by = ${snapshot.updated_by}
      where id = 1
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
