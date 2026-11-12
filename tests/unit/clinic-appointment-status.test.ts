import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_STATUSES,
  canChangeAppointmentStatus,
  canUndoAppointmentStatus,
  consumesPackageSession,
  occupiesPackageSlot,
  sameClinicDay,
  type AppointmentStatus,
} from "@/modules/clinic/appointment-status";

const ALLOWED_FROM_SCHEDULED = [
  "completed",
  "missed_notified",
  "missed_unnotified",
  "cancelled",
] as const;

describe("mudanças de status da sessão", () => {
  it("só sai de scheduled para realizada, falta, falta sem aviso ou cancelada", () => {
    for (const to of ALLOWED_FROM_SCHEDULED) {
      expect(canChangeAppointmentStatus("scheduled", to)).toBe(true);
    }
    for (const to of APPOINTMENT_STATUSES) {
      if ((ALLOWED_FROM_SCHEDULED as readonly string[]).includes(to)) continue;
      expect(canChangeAppointmentStatus("scheduled", to)).toBe(false);
    }
  });

  it("não altera status pelo fluxo normal depois de sair de scheduled", () => {
    const blocked: AppointmentStatus[] = [
      "completed",
      "missed_notified",
      "missed_unnotified",
      "cancelled",
      "rescheduled",
    ];
    for (const from of blocked) {
      for (const to of APPOINTMENT_STATUSES) {
        expect(canChangeAppointmentStatus(from, to)).toBe(false);
      }
    }
  });

  it("conta no pacote scheduled, completed e missed_unnotified", () => {
    expect(occupiesPackageSlot("scheduled")).toBe(true);
    expect(occupiesPackageSlot("completed")).toBe(true);
    expect(occupiesPackageSlot("missed_unnotified")).toBe(true);
    expect(occupiesPackageSlot("missed_notified")).toBe(false);
    expect(occupiesPackageSlot("cancelled")).toBe(false);
    expect(occupiesPackageSlot("rescheduled")).toBe(false);
  });

  it("desfaz completed, faltas e cancelada, mas não scheduled nem remarcada", () => {
    expect(canUndoAppointmentStatus("completed")).toBe(true);
    expect(canUndoAppointmentStatus("missed_notified")).toBe(true);
    expect(canUndoAppointmentStatus("missed_unnotified")).toBe(true);
    expect(canUndoAppointmentStatus("cancelled")).toBe(true);
    expect(canUndoAppointmentStatus("scheduled")).toBe(false);
    expect(canUndoAppointmentStatus("rescheduled")).toBe(false);
  });

  it("compara o mesmo dia no fuso America/Sao_Paulo perto da meia-noite", () => {
    expect(
      sameClinicDay(
        new Date("2026-12-02T02:58:00.000Z"),
        new Date("2026-12-02T02:59:00.000Z"),
      ),
    ).toBe(true);
    expect(
      sameClinicDay(
        new Date("2026-12-02T02:59:00.000Z"),
        new Date("2026-12-02T03:01:00.000Z"),
      ),
    ).toBe(false);
    expect(
      sameClinicDay(
        new Date("2026-12-01T23:30:00.000Z"),
        new Date("2026-12-02T02:30:00.000Z"),
      ),
    ).toBe(true);
  });

  it("consome sessão só com completed e missed_unnotified", () => {
    expect(consumesPackageSession("completed")).toBe(true);
    expect(consumesPackageSession("missed_unnotified")).toBe(true);
    expect(consumesPackageSession("scheduled")).toBe(false);
    expect(consumesPackageSession("missed_notified")).toBe(false);
    expect(consumesPackageSession("cancelled")).toBe(false);
    expect(consumesPackageSession("rescheduled")).toBe(false);
  });
});
