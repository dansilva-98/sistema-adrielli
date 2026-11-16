import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildIcsCalendar,
  calendarEventTitle,
  calendarLocation,
  escapeIcsText,
  foldIcsLine,
  formatIcsLocal,
} from "@/modules/clinic/calendar-ics";
import {
  CALENDAR_TOKEN_PATTERN,
  calendarFeedPath,
  calendarTokenHashMatches,
  generateCalendarToken,
  hashCalendarToken,
  parseCalendarFeedFile,
} from "@/modules/clinic/calendar-token";

const EIGHT_BRT = new Date("2026-11-17T11:00:00.000Z");
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";

function icsFor(summary: string, location = "Consultório"): string {
  return buildIcsCalendar(
    [
      {
        id: APPOINTMENT_ID,
        startsAt: EIGHT_BRT,
        endsAt: new Date("2026-11-17T11:50:00.000Z"),
        summary,
        location,
      },
    ],
    new Date("2026-11-16T15:00:00.000Z"),
  );
}

describe("calendário ICS", () => {
  it("A7: sessão às 08h de Brasília aparece às 08:00 no ICS", () => {
    expect(formatIcsLocal(EIGHT_BRT)).toBe("20261117T080000");
    const ics = icsFor("Clarinha L.");
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20261117T080000");
    expect(ics).toContain("DTEND;TZID=America/Sao_Paulo:20261117T085000");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:America/Sao_Paulo");
    expect(ics).toContain("TZOFFSETTO:-0300");
    expect(ics).not.toContain("DTSTART:20261117T110000Z");
  });

  it("usa CRLF, dobra em 75 octetos e escapa texto", () => {
    expect(escapeIcsText("Ana; Li, a\\b\nC")).toBe("Ana\\; Li\\, a\\\\b\\nC");
    const long = `Clarinha ${"á".repeat(60)} L.`;
    const ics = icsFor(long, "Sala 1\nRua das Flores, 10");
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replaceAll("\r\n", "")).not.toContain("\n");
    expect(ics).toContain("SUMMARY:Clarinha ");
    expect(ics).toContain("á");
    expect(ics).toContain("LOCATION:Sala 1\\nRua das Flores\\, 10");
    expect(ics).toContain(
      "UID:11111111-1111-4111-8111-111111111111@adrielliflores.com.br",
    );
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics).toContain("BEGIN:VALARM");
    for (const line of ics.split("\r\n").filter(Boolean)) {
      expect(Buffer.from(line, "utf8").length, line).toBeLessThanOrEqual(75);
    }
    const folded = foldIcsLine(`SUMMARY:${"ã".repeat(80)}`);
    expect(folded).toContain("\r\n ");
    for (const line of folded.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
    expect(folded.replaceAll("\r\n ", "").includes("�")).toBe(false);
  });

  it("título usa o nome de tratamento e a inicial do sobrenome", () => {
    expect(calendarEventTitle("Maria Clara Lima", "Clarinha")).toBe("Clarinha L.");
    expect(calendarEventTitle("Paciente Teste", null)).toBe("Paciente T.");
    expect(calendarEventTitle("Clarinha", null)).toBe("Clarinha");
    expect(calendarLocation("Sala 1", "Rua A, 10")).toBe("Sala 1\nRua A, 10");
    expect(calendarLocation("  ", "")).toBe("");
  });

  it("guarda o token só como SHA-256 e rejeita o arquivo malformado", () => {
    const token = generateCalendarToken();
    expect(token).toMatch(CALENDAR_TOKEN_PATTERN);
    expect(Buffer.from(token, "base64url").length).toBeGreaterThanOrEqual(32);
    expect(hashCalendarToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCalendarToken(token)).not.toBe(token);
    expect(parseCalendarFeedFile(`${token}.ics`)).toBe(token);
    expect(parseCalendarFeedFile("abc.ics")).toBeNull();
    expect(parseCalendarFeedFile(token)).toBeNull();
    expect(calendarTokenHashMatches(hashCalendarToken(token), token)).toBe(true);
    expect(
      calendarTokenHashMatches(hashCalendarToken(token), generateCalendarToken()),
    ).toBe(false);
    expect(calendarTokenHashMatches(null, token)).toBe(false);
    expect(calendarFeedPath(token)).toBe(`/api/consultorio/calendario/${token}.ics`);
  });

  it("a migration acrescenta o hash e o limite sem DELETE nem cascata", () => {
    const sql = readFileSync("src/db/migrations/0017_clinic_calendar_feed.sql", "utf8");
    expect(sql).toContain('CREATE TABLE "clinic"."calendar_feed_requests"');
    expect(sql).toContain("calendar_feed_token_hash");
    expect(sql).toContain(
      'GRANT SELECT, INSERT ON TABLE "clinic"."calendar_feed_requests" TO app_runtime',
    );
    expect(sql).not.toMatch(/GRANT[^;]*DELETE/);
    expect(sql).not.toMatch(/FOR DELETE/);
    expect(sql).not.toMatch(/ON DELETE cascade/i);
    expect(sql).not.toMatch(/DROP /i);
  });

  it("a migration 0018 dá DELETE só em pedidos do calendário com mais de um dia", () => {
    const sql = readFileSync(
      "src/db/migrations/0018_clinic_calendar_feed_requests_prune.sql",
      "utf8",
    );
    expect(sql).toContain(
      'GRANT DELETE ON TABLE "clinic"."calendar_feed_requests" TO app_runtime',
    );
    expect(sql).toContain("FOR DELETE TO app_runtime");
    expect(sql).toContain("\"attempted_at\" < now() - interval '1 day'");
    expect(sql).not.toMatch(/ON DELETE cascade/i);
    expect(sql).not.toMatch(/DROP /i);
  });
});
