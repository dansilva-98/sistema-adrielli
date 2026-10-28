import { expect, test, type Page } from "@playwright/test";

import {
  createStaff,
  enrollVerifiedTotp,
  ownerSql,
  removeStaff,
  signIn,
  totpCode,
} from "./staff-fixtures";

const patientIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decoded(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function rememberLeaks(page: Page, terms: string[]): string[] {
  const leaked: string[] = [];
  page.on("request", (request) => {
    const url = decoded(request.url()).toLowerCase();
    for (const term of terms) {
      if (term.length > 0 && url.includes(term.toLowerCase())) leaked.push(request.url());
    }
  });
  return leaked;
}

async function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => history.length);
}

async function expectAddressHasNoTerm(
  page: Page,
  term: string,
  url: string,
): Promise<void> {
  await expect(page).toHaveURL(url);
  expect(decoded(page.url()).toLowerCase()).not.toContain(term.toLowerCase());
  expect(page.url()).not.toMatch(/[?&](?:q|busca|query)=/i);
  expect((await page.title()).toLowerCase()).not.toContain(term.toLowerCase());
}

test.describe("busca de pacientes fora da URL", () => {
  test.describe.configure({ mode: "serial" });
  const created: string[] = [];
  const patientIds: string[] = [];
  let email = "";
  let secret = "";

  test.beforeAll(async () => {
    email = `busca-url-${crypto.randomUUID()}@example.com`;
    created.push(await createStaff(email, "CLINIC_ADMIN"));
    secret = await enrollVerifiedTotp(email);
  });

  test.afterAll(async () => {
    try {
      for (const patientId of patientIds) await removeCreatedPatient(patientId);
    } finally {
      await Promise.all(created.map((id) => removeStaff(id)));
    }
  });

  test("digitar e buscar não coloca nome na URL", async ({ page }) => {
    test.setTimeout(180_000);
    const terms: string[] = [];
    const leaked = rememberLeaks(page, terms);
    const blocked = await page.request.get("/consultorio/pacientes", {
      maxRedirects: 0,
    });
    expect(blocked.headers()["cache-control"] ?? "").toContain("no-store");

    await signIn(page, email);
    await expect(page).toHaveURL(/\/equipe\/mfa\/verificar$/);
    await page.getByLabel("Código").fill(totpCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/consultorio$/);

    const listPage = await page.goto("/consultorio/pacientes");
    expect(listPage?.headers()["cache-control"] ?? "").toContain("no-store");
    await expect(page).toHaveTitle("Pacientes");
    await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();
    const listTerm = `Urlproibido${crypto.randomUUID().slice(0, 8)}`;
    terms.push(listTerm);
    const listUrl = page.url();
    const listHistory = await historyLength(page);
    await page.getByLabel("Buscar por nome ou telefone").fill(listTerm);
    await expectAddressHasNoTerm(page, listTerm, listUrl);

    const listed = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/consultorio/pacientes"),
    );
    await page.getByRole("button", { name: "Buscar" }).click();
    const listResponse = await listed;
    expect(listResponse.headers()["cache-control"] ?? "").toContain("no-store");
    expect(decoded(listResponse.url()).toLowerCase()).not.toContain(
      listTerm.toLowerCase(),
    );
    expect(new URL(listResponse.url()).searchParams.has("q")).toBe(false);
    expect(new URL(listResponse.url()).searchParams.has("query")).toBe(false);
    expect(new URL(listResponse.url()).searchParams.has("busca")).toBe(false);
    await expect(page.getByText("Nenhum paciente encontrado.")).toBeVisible();
    await expectAddressHasNoTerm(page, listTerm, listUrl);
    expect(await historyLength(page)).toBe(listHistory);

    await page.getByRole("link", { name: "Arquivados" }).click();
    await expect(page).toHaveURL(/\/consultorio\/pacientes\?situacao=arquivados$/);
    await expectAddressHasNoTerm(
      page,
      listTerm,
      "/consultorio/pacientes?situacao=arquivados",
    );
    const archivedUrl = page.url();
    const archivedHistory = await historyLength(page);
    await page.getByLabel("Buscar por nome ou telefone").fill(listTerm);
    const archivedPost = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/consultorio/pacientes"),
    );
    await page.getByRole("button", { name: "Buscar" }).click();
    const archivedResponse = await archivedPost;
    expect(decoded(archivedResponse.url()).toLowerCase()).not.toContain(
      listTerm.toLowerCase(),
    );
    expect(new URL(archivedResponse.url()).searchParams.get("situacao")).toBe(
      "arquivados",
    );
    expect(new URL(archivedResponse.url()).searchParams.has("q")).toBe(false);
    await expect(page.getByText("Nenhum paciente encontrado.")).toBeVisible();
    await expectAddressHasNoTerm(page, listTerm, archivedUrl);
    expect(await historyLength(page)).toBe(archivedHistory);

    await page.getByRole("link", { name: "Ativos" }).click();
    await expect(page).toHaveURL(/\/consultorio\/pacientes$/);
    await expectAddressHasNoTerm(page, listTerm, "/consultorio/pacientes");

    const token = crypto.randomUUID().slice(0, 8);
    const patientName = `Urlproibido Paciente ${token}`;
    const guardianName = `Urlproibido Responsavel ${token}`;
    terms.push(
      patientName,
      guardianName,
      "Urlproibido",
      "11988887777",
      "52998224725",
      "529.982.247-25",
    );
    await page.goto("/consultorio/pacientes/novo");
    await expect(page).toHaveTitle("Novo paciente");
    await page.getByLabel("Nome completo").fill(patientName);
    await page.getByLabel("CPF", { exact: true }).fill("52998224725");
    await page.getByLabel("Data de nascimento").fill("2018-03-04");
    await page.getByLabel("Nome do responsável").fill(guardianName);
    await page.getByLabel("Parentesco").selectOption("MOTHER");
    await page.getByLabel("Telefone").fill("11988887777");
    await page.getByRole("button", { name: "Cadastrar paciente" }).click();
    await expect(page).toHaveURL(/\/consultorio\/pacientes\/[0-9a-f-]{36}$/, {
      timeout: 20_000,
    });
    const patientId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(patientId).toMatch(patientIdPattern);
    patientIds.push(patientId);
    await expect(page).toHaveTitle("Paciente");
    await expectAddressHasNoTerm(page, "Urlproibido", page.url());
    const ficha = await page.goto(page.url());
    expect(ficha?.headers()["cache-control"] ?? "").toContain("no-store");
    await expect(page).toHaveTitle("Paciente");

    await page.getByRole("link", { name: "Responsáveis" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/consultorio/pacientes/${patientId}\\?secao=responsaveis$`),
    );
    const fichaUrl = page.url();
    const fichaHistory = await historyLength(page);
    await page.getByLabel("Buscar responsável já cadastrado").fill(guardianName);
    await expectAddressHasNoTerm(page, "Urlproibido", fichaUrl);
    const guardianPost = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes(patientId),
    );
    await page.getByRole("button", { name: "Buscar" }).click();
    const guardianResponse = await guardianPost;
    expect(decoded(guardianResponse.url()).toLowerCase()).not.toContain("urlproibido");
    expect(new URL(guardianResponse.url()).searchParams.has("busca")).toBe(false);
    expect(new URL(guardianResponse.url()).searchParams.has("query")).toBe(false);
    expect(new URL(guardianResponse.url()).searchParams.get("secao")).toBe(
      "responsaveis",
    );
    await expect(page.getByRole("button", { name: "Buscar" })).toBeEnabled();
    await expectAddressHasNoTerm(page, "Urlproibido", fichaUrl);
    expect(await historyLength(page)).toBe(fichaHistory);
    expect(leaked).toEqual([]);
  });
});

async function removeCreatedPatient(patientId: string): Promise<void> {
  if (!patientIdPattern.test(patientId)) return;
  const sql = ownerSql();
  try {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      const guardians = await tx<{ guardian_id: string }[]>`
        select guardian_id from clinic.patient_guardians
        where patient_id = ${patientId}::uuid
      `;
      await tx`
        delete from clinic.patient_guardians where patient_id = ${patientId}::uuid
      `;
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
      await tx`delete from clinic.patients where id = ${patientId}::uuid`;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
