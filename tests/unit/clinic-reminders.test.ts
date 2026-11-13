import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildReminderEmail,
  clinicHourInSaoPaulo,
  groupByGuardian,
  isReminderHourReached,
  treatmentName,
} from "@/modules/clinic/reminders";

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

  it("o workflow usa o cron de Brasília, o banco de runtime e não o backup", () => {
    const workflow = readFileSync(".github/workflows/reminders.yml", "utf8");
    const script = readFileSync("scripts/send-reminders.ts", "utf8");
    expect(workflow).toContain('cron: "0 10-23,0 * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
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
      "github.event_name == 'workflow_dispatch' && inputs.destino == 'staging'",
    );
    expect(workflow).not.toContain("BACKUP_DATABASE_URL");
    expect(workflow).not.toContain("MIGRATIONS_DATABASE_URL");
    expect(workflow).not.toContain("cancel-in-progress: true");
    expect(script).toContain("appointmentIds");
    expect(script).not.toMatch(/guardianEmail|message\.to|full_name|preferred_name/);
    expect(script).toContain("publicLogMessage");
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
});
