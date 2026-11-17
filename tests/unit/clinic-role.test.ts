import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CONSULTORIO_ROLES } from "@/modules/identity/access";

function functionBodies(source: string): string[] {
  const marks = [...source.matchAll(/export async function /g)].map(
    (match) => match.index ?? 0,
  );
  return marks.map((start, index) =>
    source.slice(start, marks[index + 1] ?? source.length),
  );
}

describe("papel do consultório", () => {
  it("aceita CLINIC_ADMIN e SUPER_ADMIN", () => {
    expect([...CONSULTORIO_ROLES].sort()).toEqual(["CLINIC_ADMIN", "SUPER_ADMIN"]);
  });

  it.each([
    "src/modules/clinic/patients.ts",
    "src/modules/clinic/attachments.ts",
    "src/modules/clinic/agenda-settings.ts",
    "src/modules/clinic/packages.ts",
    "src/modules/clinic/appointments.ts",
    "src/modules/clinic/server/actions.ts",
    "src/modules/clinic/server/read.ts",
    "src/modules/clinic/server/agenda-actions.ts",
    "src/modules/clinic/server/agenda-read.ts",
  ])("%s chama assertRole antes de ler ou gravar", (file) => {
    const source = readFileSync(file, "utf8");
    const bodies = functionBodies(source);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).toMatch(/assertRole\(CONSULTORIO_ROLES\)|await currentActor\(\)/);
    }
  });

  it("o feed público não exige sessão, e gerar ou baixar a sessão exige papel", () => {
    const source = readFileSync("src/modules/clinic/calendar-feed.ts", "utf8");
    const bodies = Object.fromEntries(
      functionBodies(source).map((body) => {
        const name = /export async function ([A-Za-z0-9_]+)/.exec(body)?.[1] ?? "";
        return [name, body];
      }),
    );
    expect(bodies.serveCalendarFeed).not.toMatch(/assertRole|requireStaff|currentActor/);
    expect(bodies.calendarFeedExists).toMatch(/assertRole\(CONSULTORIO_ROLES\)/);
    expect(bodies.rotateCalendarFeedToken).toMatch(/assertRole\(CONSULTORIO_ROLES\)/);
    expect(bodies.serveAppointmentCalendar).toMatch(/assertRole\(CONSULTORIO_ROLES\)/);
  });
});
