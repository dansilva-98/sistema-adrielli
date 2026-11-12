import { describe, expect, it } from "vitest";

import type { AppointmentStatus } from "@/modules/clinic/appointment-status";
import {
  consumedSessionCount,
  occupiedSessionCount,
  packageHasSlot,
  pendingMakeupCount,
  remainingSessions,
} from "@/modules/clinic/package-balance";

describe("contagem calculada do pacote", () => {
  it("ocupa scheduled, completed e missed_unnotified e ignora os demais", () => {
    const statuses: AppointmentStatus[] = [
      "scheduled",
      "completed",
      "missed_unnotified",
      "missed_notified",
      "cancelled",
      "rescheduled",
    ];
    expect(occupiedSessionCount(statuses)).toBe(3);
    expect(consumedSessionCount(statuses)).toBe(2);
    expect(remainingSessions(4, 3)).toBe(1);
    expect(packageHasSlot(4, 3)).toBe(true);
    expect(packageHasSlot(3, 3)).toBe(false);
    expect(packageHasSlot(2, 3)).toBe(false);
  });

  it("falta avisada gera reposição pendente até existir makeup", () => {
    expect(pendingMakeupCount(2, 0)).toBe(2);
    expect(pendingMakeupCount(2, 1)).toBe(1);
    expect(pendingMakeupCount(1, 1)).toBe(0);
  });
});
