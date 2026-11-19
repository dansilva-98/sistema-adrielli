import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildReminderEmail,
  canStartReminderGuardian,
  clinicHourInSaoPaulo,
  groupByGuardian,
  isReminderHourReached,
  REMINDER_GUARDIAN_BUDGET_MS,
  treatmentName,
} from "@/modules/clinic/reminders";
import { REMINDER_JOB_DEADLINE_MS } from "@/modules/clinic/reminder-job";

const EIGHT_BRT = new Date("2026-11-14T11:00:00.000Z");

describe("lembrete por e-mail", () => {
  it("A7: sessão às 08h de Brasília aparece às 08:00 no e-mail", () => {
    expect(clinicHourInSaoPaulo(EIGHT_BRT)).toBe(8);
    expect(isReminderHourReached(EIGHT_BRT, 9)).toBe(false);
    expect(isReminderHourReached(new Date("2026-11-14T12:00:00.000Z"), 9)).toBe(true);
    const email = buildReminderEmail({
      sessions: [{ treatmentName: "Ana", startsAt: EIGHT_BRT }],
      locationName: "Sala 1",
      locationAddress: "Rua das Flores, 10",
      whatsappUrl: "https://wa.me/5511999999999",
    });
    expect(email.text).toContain("08:00");
    expect(email.text).toContain("14/11/2026");
    expect(email.html).toContain("08:00");
    expect(email.text).not.toContain("11:00");
  });

  it("monta o e-mail sem dado clínico", () => {
    const email = buildReminderEmail({
      sessions: [{ treatmentName: "Ana", startsAt: EIGHT_BRT }],
      locationName: "Sala 1",
      locationAddress: "Rua das Flores, 10",
      whatsappUrl: "https://wa.me/5511999999999",
    });
    expect(email.subject).toBe("Lembrete de sessão — Adrielli Flores");
    expect(email.text).toContain("Ana");
    expect(email.text).toContain("Sala 1");
    expect(email.text).toContain("Rua das Flores, 10");
    expect(email.text).toContain(
      "Em caso de imprevisto, avise pelo WhatsApp: https://wa.me/5511999999999",
    );
    expect(email.html).toContain("https://wa.me/5511999999999");
    expect(email.text).not.toMatch(/TDAH|laudo|hipótese|observaç/i);
    expect(email.html).not.toMatch(/TDAH|laudo|hipótese|observaç/i);
    expect(email.text).not.toContain("@");
    expect(treatmentName("Ana Silva", "Nani")).toBe("Nani");
    expect(treatmentName("Ana Silva", null)).toBe("Ana Silva");
  });

  it("agrupa várias sessões do mesmo responsável em um e-mail", () => {
    const groups = groupByGuardian([
      { guardianId: "g-1", appointmentId: "a-1" },
      { guardianId: "g-1", appointmentId: "a-2" },
      { guardianId: "g-2", appointmentId: "a-3" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.map((row) => row.appointmentId)).toEqual(["a-1", "a-2"]);
    expect(groups[1]?.map((row) => row.appointmentId)).toEqual(["a-3"]);
    const email = buildReminderEmail({
      sessions: [
        { treatmentName: "Ana", startsAt: EIGHT_BRT },
        { treatmentName: "Pedro", startsAt: new Date("2026-11-14T13:00:00.000Z") },
      ],
      locationName: "Sala 1",
      locationAddress: "",
      whatsappUrl: null,
    });
    expect(email.text).toContain("- Ana, 14/11/2026 às 08:00");
    expect(email.text).toContain("- Pedro, 14/11/2026 às 10:00");
    expect(email.text).toContain("Em caso de imprevisto, avise pelo WhatsApp.");
  });

  it("o workflow manual usa o SHA publicado e o cron fica na Netlify", () => {
    const workflow = readFileSync(".github/workflows/reminders.yml", "utf8");
    const script = readFileSync("scripts/send-reminders.ts", "utf8");
    const job = readFileSync("src/modules/clinic/reminder-job.ts", "utf8");
    const fn = readFileSync("netlify/functions/clinic-reminders.mts", "utf8");
    const handler = readFileSync("src/modules/clinic/reminder-function.ts", "utf8");
    const reminders = readFileSync("src/modules/clinic/reminders.ts", "utf8");
    const toml = readFileSync("netlify.toml", "utf8");
    const staging = readFileSync(".github/workflows/staging.yml", "utf8");
    const production = readFileSync(".github/workflows/production.yml", "utf8");
    const envScript = readFileSync("scripts/netlify-env.mjs", "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("cron:");
    expect(workflow).toContain("reminders-${{ inputs.destino }}");
    const [productionJob, stagingJob] = workflow.split(/\n {2}staging:\n/);
    expect(productionJob).toContain("environment: lembretes");
    expect(productionJob).not.toContain("environment: production");
    expect(productionJob).toContain("actions: read");
    expect(productionJob).toContain(
      "gh run list --repo \"$GITHUB_REPOSITORY\" --workflow production.yml --branch main --event workflow_dispatch --status success --limit 1 --json headSha --jq '.[0].headSha'",
    );
    expect(productionJob).toContain("GH_TOKEN: ${{ github.token }}");
    expect(productionJob).toContain("^[0-9a-f]{40}$");
    expect(productionJob).toContain("ref: ${{ steps.versao.outputs.sha }}");
    expect(productionJob.indexOf("id: versao")).toBeLessThan(
      productionJob.indexOf("uses: actions/checkout@v4"),
    );
    expect(productionJob).not.toContain("ref: main");
    expect(stagingJob).toBeDefined();
    expect(stagingJob).not.toContain("ref:");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).toContain("secrets.STAGING_DATABASE_URL");
    expect(workflow).toContain("secrets.RESEND_API_KEY");
    expect(workflow).toContain("APP_ENV: production");
    expect(workflow).toContain("APP_ENV: staging");
    expect(workflow).toContain(
      "node --experimental-strip-types scripts/send-reminders.ts",
    );
    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.destino == 'production'",
    );
    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.destino == 'staging'",
    );
    expect(workflow).not.toContain("BACKUP_DATABASE_URL");
    expect(workflow).not.toContain("MIGRATIONS_DATABASE_URL");
    expect(workflow).not.toContain("cancel-in-progress: true");
    expect(script).toContain("runReminderJob");
    expect(script).toContain("../src/modules/clinic/reminder-job.ts");
    expect(script).not.toContain("postgres(");
    expect(job).toContain("pruneCalendarFeedRequests");
    expect(job).toContain("prunedFeedRequests");
    expect(job).toContain("publicLogMessage");
    expect(fn).toContain('schedule: "23 10-23,0 * * *"');
    expect(fn).toContain("handleClinicReminders");
    expect(fn).toContain("export const config");
    expect(fn).toContain("export default");
    expect(fn).not.toContain("runReminderJob");
    expect(fn).not.toContain("export {");
    expect(fn).not.toContain("@netlify/functions");
    expect(fn).not.toContain("@sentry/node");
    expect(fn).not.toContain("@sentry/nextjs");
    expect(handler).toContain("runReminderJob");
    expect(handler).toContain("./reminder-job.ts");
    expect(handler).toContain("remindersLockAllows");
    expect(handler).toContain("sendSentryEnvelope");
    expect(handler).toContain('result.reason !== "deadline"');
    expect(handler).toContain("REMINDER_JOB_DEADLINE_MS");
    expect(handler).not.toContain("Promise.race");
    expect(handler).not.toContain("runReminderJobWithDeadline");
    expect(job).not.toContain("Promise.race");
    expect(job).not.toContain("runReminderJobWithDeadline");
    expect(job).toContain("./calendar-feed-prune.ts");
    expect(job).toContain("./reminders.ts");
    expect(reminders).toContain("../audit/record-sql.ts");
    expect(reminders).not.toMatch(/audit\/record["']/);
    expect(reminders).not.toMatch(/audit\/record\.ts/);
    expect(job).toContain("../identity/email-mfa.ts");
    expect(job).toContain("../identity/email-transport.ts");
    expect(handler).not.toContain("@sentry/nextjs");
    expect(handler).not.toContain("@sentry/node");
    expect(toml).toContain('directory = "netlify/functions"');
    expect(staging).toContain("netlify deploy --build");
    expect(production).toContain("netlify deploy --build --prod");
    expect(staging).toContain(
      "netlify deploy --build --context deploy-preview --alias staging",
    );
    const [beforeDeploy, deployAndAfter] = production.split(
      "Publicar produção na Netlify",
    );
    expect(beforeDeploy).toContain("REMINDERS_ENABLED: ${{ vars.REMINDERS_ENABLED }}");
    expect(beforeDeploy).toContain("node scripts/netlify-env.mjs");
    expect(deployAndAfter).toBeDefined();
    expect(deployAndAfter).not.toContain("REMINDERS_ENABLED");
    expect(staging).not.toContain("REMINDERS_ENABLED");
    expect(envScript).toContain(
      'process.env.APP_ENV === "production" ? ["REMINDERS_ENABLED"]',
    );
    expect(script).not.toMatch(/guardianEmail|message\.to|full_name|preferred_name/);
  });

  it("a migration grava o par sessão-responsável sem DELETE", () => {
    const sql = readFileSync(
      "src/db/migrations/0016_clinic_appointment_reminders.sql",
      "utf8",
    );
    expect(sql).toContain('CREATE TABLE "clinic"."appointment_reminders"');
    expect(sql).toContain('PRIMARY KEY("appointment_id","guardian_id")');
    expect(sql).toContain("ON DELETE no action");
    expect(sql).toContain(
      'GRANT SELECT, INSERT ON TABLE "clinic"."appointment_reminders" TO app_runtime',
    );
    expect(sql).not.toMatch(/GRANT[^;]*DELETE/);
    expect(sql).not.toMatch(/FOR DELETE/);
    expect(sql).not.toMatch(/ON DELETE cascade/i);
  });

  it("não começa um responsável novo depois de 12 s", () => {
    expect(REMINDER_GUARDIAN_BUDGET_MS).toBe(11_000);
    expect(REMINDER_JOB_DEADLINE_MS).toBe(23_000);
    expect(canStartReminderGuardian(12_000, REMINDER_JOB_DEADLINE_MS)).toBe(true);
    expect(canStartReminderGuardian(12_001, REMINDER_JOB_DEADLINE_MS)).toBe(false);
    expect(canStartReminderGuardian(0, undefined)).toBe(true);
  });
});
