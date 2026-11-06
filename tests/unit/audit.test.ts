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
});
