import { readFileSync } from "node:fs";

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

test.describe("calendário do iPhone", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];
  let email = "";
  let secret = "";
  let staffId = "";
  let patientId = "";
  let appointmentId = "";
  let settingsSnapshot: CalendarSettingsSnapshot | null = null;
  const stamp = crypto.randomUUID().slice(0, 8);
  const patientName = `Agenda Calendario ${stamp}`;

  test.beforeAll(async () => {
    email = `agenda-calendario-${crypto.randomUUID()}@example.com`;
    staffId = await createStaff(email, "CLINIC_ADMIN");
    created.push(staffId);
    secret = await enrollVerifiedTotp(email);
    settingsSnapshot = await snapshotCalendarSettings();
    await clearCalendarFeed();
    patientId = await insertCalendarPatient(staffId, patientName);
    appointmentId = await insertCalendarAppointment(staffId, patientId);
  });

  test.afterAll(async () => {
    try {
      if (patientId) await removeCalendarPatient(patientId);
      await restoreCalendarSettings(settingsSnapshot);
    } finally {
      await Promise.all(created.map((id) => removeStaff(id)));
    }
  });

  test("gera e troca o link, e baixa o ICS da sessão", async ({ page }) => {
    test.setTimeout(180_000);
    await signInStaff(page, email, secret);
    await page.goto("/consultorio/agenda/configuracoes");
    await expect(
      page.getByRole("heading", { name: "Configurações da agenda" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Gerar link do calendário" }).click();
    const feed = page.locator("#calendar-feed-url");
    await expect(feed).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(
        "Ajustes → Calendário → Contas → Adicionar conta → Outra → Calendário assinado",
      ),
    ).toBeVisible();
    const firstUrl = await feed.inputValue();
    const firstPath = new URL(firstUrl).pathname;
    const first = await page.request.get(firstPath);
    expect(first.status()).toBe(200);
    expect(first.headers()["content-type"]).toContain("text/calendar");
    const firstBody = await first.text();
    expect(firstBody).toContain("BEGIN:VCALENDAR");
    expect(firstBody).toContain("SUMMARY:");
    expect(firstBody).not.toContain(patientName);

    await page.getByRole("button", { name: "Trocar link" }).click();
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(feed).not.toHaveValue(firstUrl, { timeout: 20_000 });
    const secondUrl = await feed.inputValue();
    const secondPath = new URL(secondUrl).pathname;
    const rotated = await page.request.get(firstPath);
    expect(rotated.status()).toBe(404);
    const next = await page.request.get(secondPath);
    expect(next.status()).toBe(200);
    await expectAxe(page);

    await page.goto(`/consultorio/agenda/${appointmentId}`);
    await expect(page.getByRole("heading", { name: patientName })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Adicionar ao calendário" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("sessao.ics");
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const ics = readFileSync(downloadPath!, "utf8");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(`UID:${appointmentId}@adrielliflores.com.br`);
    expect(ics).not.toContain(patientName);
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
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, JSON.stringify(results.violations)).toEqual([]);
}

type CalendarSettingsSnapshot = {
  calendar_feed_token_hash: string | null;
  calendar_feed_rotated_at: Date | string | null;
  updated_by: string | null;
};

async function snapshotCalendarSettings(): Promise<CalendarSettingsSnapshot | null> {
  const sql = ownerSql();
  try {
    const rows = await sql<CalendarSettingsSnapshot[]>`
      select calendar_feed_token_hash, calendar_feed_rotated_at, updated_by
      from clinic.settings
      where id = 1
    `;
    return rows[0] ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function clearCalendarFeed(): Promise<void> {
  const sql = ownerSql();
  try {
    await sql`
      update clinic.settings
      set calendar_feed_token_hash = null, calendar_feed_rotated_at = null
      where id = 1
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function restoreCalendarSettings(
  snapshot: CalendarSettingsSnapshot | null,
): Promise<void> {
  if (!snapshot) return;
  const sql = ownerSql();
  try {
    await sql`
      update clinic.settings
      set
        calendar_feed_token_hash = ${snapshot.calendar_feed_token_hash},
        calendar_feed_rotated_at = ${snapshot.calendar_feed_rotated_at},
        updated_by = ${snapshot.updated_by}
      where id = 1
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function insertCalendarPatient(staffId: string, fullName: string): Promise<string> {
  loadLocalEnv();
  const sql = ownerSql();
  try {
    return await sql.begin(async (tx) => {
      const patients = await tx<{ id: string }[]>`
        insert into clinic.patients (full_name, birth_date, created_by)
        values (${fullName}, '2018-04-05', ${staffId}::uuid)
        returning id
      `;
      const patient = patients[0]?.id;
      if (!patient) throw new Error("Falha ao gravar o paciente de teste.");
      const guardians = await tx<{ id: string }[]>`
        insert into clinic.guardians (full_name, relationship, phone)
        values ('Responsavel Calendario', 'MOTHER', '11988887766')
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

async function insertCalendarAppointment(
  staffId: string,
  patientId: string,
): Promise<string> {
  const sql = ownerSql();
  try {
    const rows = await sql<{ id: string }[]>`
      insert into clinic.appointments (
        patient_id, starts_at, ends_at, created_by
      ) values (
        ${patientId}::uuid,
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          + interval '3 days' + interval '8 hours'
        ) at time zone 'America/Sao_Paulo',
        (
          date_trunc('day', timezone('America/Sao_Paulo', now()))
          + interval '3 days' + interval '8 hours' + interval '50 minutes'
        ) at time zone 'America/Sao_Paulo',
        ${staffId}::uuid
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("Falha ao gravar a sessão de teste.");
    return id;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function removeCalendarPatient(id: string): Promise<void> {
  if (!patientIdPattern.test(id)) return;
  loadLocalEnv();
  const sql = ownerSql();
  try {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`delete from clinic.appointments where patient_id = ${id}::uuid`;
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
