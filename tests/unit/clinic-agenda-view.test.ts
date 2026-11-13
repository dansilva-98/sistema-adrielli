import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_MODALITY_LABELS,
  APPOINTMENT_STATUS_LABELS,
  canOfferMakeup,
  canShowUndo,
} from "@/modules/clinic/appointment-status";
import {
  agendaBoardStart,
  agendaHref,
  appointmentOverlapsClinicDay,
  clinicDateList,
  linkedScheduledLabel,
  packageOverflowLabel,
  packageUsageLabel,
  parseAgendaView,
  remainingSessionWarning,
  seriesConfirmFlags,
  seriesConfirmKey,
  shiftAgendaDate,
} from "@/modules/clinic/agenda-view";
import { parseOptionalPriceCents } from "@/modules/clinic/agenda-schema";
import { clinicErrorMessage } from "@/modules/clinic/clinic-errors";
import {
  addClinicDays,
  expiredPackageLabel,
  formatClinicSlotLabel,
  isClinicTime,
  mondayOfClinicWeek,
} from "@/modules/clinic/format";

describe("visões e textos da agenda", () => {
  it("rotula status e modalidade em português", () => {
    expect(APPOINTMENT_STATUS_LABELS.scheduled).toBe("Marcada");
    expect(APPOINTMENT_STATUS_LABELS.completed).toBe("Realizada");
    expect(APPOINTMENT_STATUS_LABELS.missed_notified).toBe("Faltou (avisou)");
    expect(APPOINTMENT_STATUS_LABELS.missed_unnotified).toBe("Faltou (sem aviso)");
    expect(APPOINTMENT_MODALITY_LABELS.in_person).toBe("Presencial");
  });

  it("calcula segunda-feira e navega as visões", () => {
    expect(mondayOfClinicWeek("2026-11-12")).toBe("2026-11-09");
    expect(mondayOfClinicWeek("2026-11-09")).toBe("2026-11-09");
    expect(mondayOfClinicWeek("2026-11-08")).toBe("2026-11-02");
    expect(addClinicDays("2026-11-12", 1)).toBe("2026-11-13");
    expect(parseAgendaView(undefined)).toBe("dia");
    expect(parseAgendaView("semana")).toBe("semana");
    expect(agendaBoardStart("semana", "2026-11-12")).toBe("2026-11-09");
    expect(shiftAgendaDate("dia", "2026-11-12", 1)).toBe("2026-11-13");
    expect(shiftAgendaDate("semana", "2026-11-12", -1)).toBe("2026-11-05");
    expect(clinicDateList("2026-11-09", 2)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(agendaHref("dia", "2026-11-12")).toBe("/consultorio/agenda?data=2026-11-12");
    expect(agendaHref("lista", "2026-11-12")).toBe(
      "/consultorio/agenda?visao=lista&data=2026-11-12",
    );
  });

  it("formata horário, pacote vencido e erros em português", () => {
    expect(isClinicTime("09:00")).toBe(true);
    expect(isClinicTime("24:00")).toBe(false);
    expect(formatClinicSlotLabel(new Date("2026-11-12T12:00:00.000Z"))).toBe(
      "12/11/2026 09:00",
    );
    expect(expiredPackageLabel("2026-01-15", "2026-11-12")).toBe(
      "Pacote vencido em 15/01",
    );
    expect(expiredPackageLabel("2026-12-01", "2026-11-12")).toBeNull();
    expect(packageUsageLabel(3, 10)).toBe("usadas 3 de 10");
    expect(remainingSessionWarning(1)).toBe("Falta 1 sessão neste pacote.");
    expect(remainingSessionWarning(2)).toBeNull();
    expect(clinicErrorMessage("overlap")).toBe("Este horário já está ocupado.");
    expect(clinicErrorMessage("package-exhausted")).toBe("O pacote não tem mais vagas.");
    expect(clinicErrorMessage("undo-not-allowed")).toBe(
      "Não é possível desfazer esta alteração.",
    );
    expect(clinicErrorMessage("makeup-taken")).toBe("Esta falta já tem uma reposição.");
    expect(clinicErrorMessage("series-conflict")).toBe(
      "Há horários com conflito. Nada foi criado.",
    );
    expect(clinicErrorMessage("package-overflow")).toBe(
      "Há sessões que ficam fora do pacote.",
    );
    expect(packageOverflowLabel(1)).toBe("1 sessão fica fora do pacote");
    expect(packageOverflowLabel(3)).toBe("3 sessões ficam fora do pacote");
    expect(linkedScheduledLabel(0)).toBeNull();
    expect(linkedScheduledLabel(1)).toBe(
      "1 sessão marcada continua ligada a este pacote",
    );
    expect(linkedScheduledLabel(3)).toBe(
      "3 sessões marcadas continuam ligadas a este pacote",
    );
    expect(
      seriesConfirmKey({
        date: "2029-08-06",
        time: "15:00",
        durationMinutes: 50,
        weeks: 3,
        packageId: "pkg-1",
      }),
    ).toBe("2029-08-06|15:00|50|3|pkg-1");
    expect(
      seriesConfirmFlags({
        postedKey: "k",
        slotKey: "k",
        confirmLivres: false,
        confirmOverflow: true,
      }),
    ).toEqual({ skipConflicts: false, overflowConfirmed: true });
    expect(
      seriesConfirmFlags({
        postedKey: "k",
        slotKey: "k",
        confirmLivres: true,
        confirmOverflow: true,
      }),
    ).toEqual({ skipConflicts: true, overflowConfirmed: true });
    expect(
      seriesConfirmFlags({
        postedKey: "other",
        slotKey: "k",
        confirmLivres: true,
        confirmOverflow: true,
      }),
    ).toEqual({ skipConflicts: false, overflowConfirmed: false });
    expect(parseOptionalPriceCents("")).toBeNull();
    expect(parseOptionalPriceCents("150")).toBe(15000);
    expect(parseOptionalPriceCents("150,50")).toBe(15050);
  });

  it("mostra Desfazer só no mesmo dia em America/Sao_Paulo", () => {
    expect(
      canShowUndo(
        "completed",
        new Date("2026-12-02T02:59:00.000Z"),
        new Date("2026-12-02T02:50:00.000Z"),
      ),
    ).toBe(true);
    expect(
      canShowUndo(
        "completed",
        new Date("2026-12-02T02:59:00.000Z"),
        new Date("2026-12-02T03:01:00.000Z"),
      ),
    ).toBe(false);
    expect(canShowUndo("scheduled", new Date(), new Date())).toBe(false);
    expect(canShowUndo("rescheduled", new Date(), new Date())).toBe(false);
    expect(
      canShowUndo(
        "missed_notified",
        new Date("2026-12-02T02:50:00.000Z"),
        new Date("2026-12-02T02:59:00.000Z"),
        true,
      ),
    ).toBe(false);
    expect(canOfferMakeup("missed_notified", false)).toBe(true);
    expect(canOfferMakeup("missed_notified", true)).toBe(false);
  });

  it("mostra no dia seguinte a sessão que atravessa a meia-noite", () => {
    const starts = new Date("2026-11-13T02:30:00.000Z");
    const ends = new Date("2026-11-13T03:20:00.000Z");
    expect(appointmentOverlapsClinicDay(starts, ends, "2026-11-12")).toBe(true);
    expect(appointmentOverlapsClinicDay(starts, ends, "2026-11-13")).toBe(true);
    expect(appointmentOverlapsClinicDay(starts, ends, "2026-11-11")).toBe(false);
    const sameDayStart = new Date("2026-11-12T13:00:00.000Z");
    const sameDayEnd = new Date("2026-11-12T13:50:00.000Z");
    expect(appointmentOverlapsClinicDay(sameDayStart, sameDayEnd, "2026-11-12")).toBe(
      true,
    );
    expect(appointmentOverlapsClinicDay(sameDayStart, sameDayEnd, "2026-11-13")).toBe(
      false,
    );
    const midnight = new Date("2026-11-13T03:00:00.000Z");
    expect(
      appointmentOverlapsClinicDay(
        new Date("2026-11-13T02:10:00.000Z"),
        midnight,
        "2026-11-13",
      ),
    ).toBe(false);
  });
});
