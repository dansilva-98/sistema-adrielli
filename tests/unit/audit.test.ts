import { describe, expect, it } from "vitest";

import { recordAudit } from "@/modules/audit/record";

describe("recordAudit", () => {
  it("recusa metadado com dado pessoal antes de gravar", async () => {
    await expect(
      recordAudit({
        action: "auth.login.failure",
        metadata: { email: "pessoa@example.com" },
      }),
    ).rejects.toThrow("Metadado de auditoria recusado.");
    await expect(
      recordAudit({
        action: "auth.mfa.unknown_factor",
        metadata: { factor_id: "nao-e-uuid", email: "pessoa@example.com" },
      }),
    ).rejects.toThrow("Metadado de auditoria recusado.");
  });

  it("aceita o metadata do desfazer e recusa to diferente de scheduled", async () => {
    await expect(
      recordAudit({
        action: "clinic.appointment.status_changed",
        metadata: { from: "completed", to: "scheduled", undo: true },
      }),
    ).rejects.toThrow(
      /Variável de ambiente inválida|Recusado: URLs|ECONNREFUSED|connect/i,
    );
    await expect(
      recordAudit({
        action: "clinic.appointment.status_changed",
        metadata: { from: "completed", to: "cancelled", undo: true },
      }),
    ).rejects.toThrow("Metadado de auditoria recusado.");
    await expect(
      recordAudit({
        action: "clinic.appointment.status_changed",
        metadata: { from: "completed", to: "scheduled", undo: true, notes: "clínico" },
      }),
    ).rejects.toThrow("Metadado de auditoria recusado.");
  });

  it("aceita linked e recusa dado pessoal junto", async () => {
    await expect(
      recordAudit({
        action: "clinic.appointment.package_changed",
        metadata: { linked: true },
      }),
    ).rejects.toThrow(
      /Variável de ambiente inválida|Recusado: URLs|ECONNREFUSED|connect/i,
    );
    await expect(
      recordAudit({
        action: "clinic.appointment.package_changed",
        metadata: { linked: false, email: "pessoa@example.com" },
      }),
    ).rejects.toThrow("Metadado de auditoria recusado.");
  });
});
