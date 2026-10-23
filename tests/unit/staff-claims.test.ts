import { describe, expect, it } from "vitest";

import { verifiedStaffClaims } from "@/modules/identity/staff-claims";

describe("verifiedStaffClaims", () => {
  it("lê o usuário, a sessão e o nível do token verificado", () => {
    expect(
      verifiedStaffClaims({
        sub: "user-1",
        session_id: "session-1",
        aal: "aal2",
      }),
    ).toEqual({ userId: "user-1", sessionId: "session-1", aal: "aal2" });
  });

  it("não aceita token sem usuário ou sem sessão", () => {
    expect(verifiedStaffClaims(null)).toBeNull();
    expect(verifiedStaffClaims({ sub: "user-1" })).toBeNull();
    expect(verifiedStaffClaims({ session_id: "session-1" })).toBeNull();
  });

  it("trata nível ausente como aal1", () => {
    expect(verifiedStaffClaims({ sub: "user-1", session_id: "session-1" })?.aal).toBe(
      "aal1",
    );
  });
});
