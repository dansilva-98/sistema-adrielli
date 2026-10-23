import { describe, expect, it } from "vitest";

import {
  parseStaffInvite,
  refusalForDisable,
  refusalForRoles,
  StaffAdminError,
} from "@/modules/identity/staff-admin";

describe("gestão de usuários", () => {
  it("recusa desativar a si mesmo e o último super admin", () => {
    expect(
      refusalForDisable({ actorId: "a", targetId: "a", activeSuperAdminIds: ["a", "b"] }),
    ).toBe("self");
    expect(
      refusalForDisable({ actorId: "b", targetId: "a", activeSuperAdminIds: ["a"] }),
    ).toBe("last");
    expect(
      refusalForDisable({ actorId: "b", targetId: "a", activeSuperAdminIds: ["a", "b"] }),
    ).toBeNull();
  });

  it("recusa papel vazio e remover o último super admin", () => {
    expect(
      refusalForRoles({ targetId: "a", nextRoles: [], activeSuperAdminIds: ["a", "b"] }),
    ).toBe("roles");
    expect(
      refusalForRoles({
        targetId: "a",
        nextRoles: ["CONTENT_ADMIN"],
        activeSuperAdminIds: ["a"],
      }),
    ).toBe("last");
    expect(
      refusalForRoles({
        targetId: "a",
        nextRoles: ["CONTENT_ADMIN"],
        activeSuperAdminIds: ["a", "b"],
      }),
    ).toBeNull();
  });

  it("recusa convite sem nome, e-mail ou papel", () => {
    expect(() =>
      parseStaffInvite({ name: "  ", email: "a@b.co", roles: ["SUPER_ADMIN"] }),
    ).toThrow(StaffAdminError);
    expect(() =>
      parseStaffInvite({ name: "Ana", email: "nao-e-email", roles: ["SUPER_ADMIN"] }),
    ).toThrow(StaffAdminError);
    expect(() => parseStaffInvite({ name: "Ana", email: "a@b.co", roles: [] })).toThrow(
      StaffAdminError,
    );
  });
});
