import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ADMIN_ROLES,
  CONSULTORIO_ROLES,
  USER_ADMIN_ROLES,
  type StaffRole,
} from "@/modules/identity/access";
import { decideStaffAccess } from "@/modules/identity/guard";
import { sameOrigin } from "@/modules/identity/origin";
import {
  isGuardedRouteFile,
  sourceDeclaresOriginGuard,
  sourceDeclaresStaffGuard,
} from "@/modules/identity/route-guard";
import { STAFF_IDLE_MS, type StaffSession } from "@/modules/identity/staff-session";
import type { StaffProfile } from "@/modules/identity/login";

const now = 1_700_000_000_000;
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "session-1";

function session(lastActivity = now): StaffSession {
  return { userId, sessionId, startedAt: now, lastActivity };
}

function profile(roles: StaffRole[], disabledAt: Date | null = null): StaffProfile {
  return { id: userId, kind: "STAFF", disabledAt, roles };
}

const areas = [
  ["admin", ADMIN_ROLES],
  ["consultorio", CONSULTORIO_ROLES],
  ["usuarios", USER_ADMIN_ROLES],
] as const;

describe("decideStaffAccess", () => {
  it("nega anônimo, cliente e usuário desativado em todas as áreas", () => {
    for (const [, roles] of areas) {
      expect(
        decideStaffAccess({
          userId: null,
          sessionId: null,
          cookie: null,
          profile: null,
          aal: null,
          hasVerifiedTotp: false,
          roles,
          now,
        }).ok,
      ).toBe(false);
      expect(
        decideStaffAccess({
          userId,
          sessionId,
          cookie: session(),
          profile: { id: userId, kind: "CUSTOMER", disabledAt: null, roles: [] },
          aal: "aal1",
          hasVerifiedTotp: false,
          roles,
          now,
        }),
      ).toMatchObject({ ok: false, reason: "rejected" });
      expect(
        decideStaffAccess({
          userId,
          sessionId,
          cookie: session(),
          profile: profile(["SUPER_ADMIN"], new Date(now)),
          aal: "aal2",
          hasVerifiedTotp: true,
          roles,
          now,
        }),
      ).toMatchObject({ ok: false, reason: "rejected" });
    }
  });

  it("aplica a matriz de papéis", () => {
    const actors: { roles: StaffRole[]; allow: string[] }[] = [
      { roles: ["CONTENT_ADMIN"], allow: ["admin"] },
      { roles: ["CLINIC_ADMIN"], allow: ["consultorio"] },
      { roles: ["SUPER_ADMIN"], allow: ["admin", "consultorio", "usuarios"] },
    ];
    for (const actor of actors) {
      for (const [area, roles] of areas) {
        const decision = decideStaffAccess({
          userId,
          sessionId,
          cookie: session(),
          profile: profile(actor.roles),
          aal: "aal2",
          hasVerifiedTotp: true,
          roles,
          now,
        });
        if (actor.allow.includes(area)) {
          expect(decision.ok).toBe(true);
        } else {
          expect(decision).toMatchObject({ ok: false, reason: "forbidden" });
        }
      }
    }
  });

  it("recusa cookie de outro usuário ou sessão e renova a atividade", () => {
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie: { ...session(), userId: "outro" },
        profile: profile(["CONTENT_ADMIN"]),
        aal: "aal1",
        hasVerifiedTotp: false,
        roles: ADMIN_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "mismatch" });
    const renewed = decideStaffAccess({
      userId,
      sessionId,
      cookie: session(now - 1000),
      profile: profile(["CONTENT_ADMIN"]),
      aal: "aal1",
      hasVerifiedTotp: false,
      roles: ADMIN_ROLES,
      now,
    });
    expect(renewed).toMatchObject({
      ok: true,
      session: { lastActivity: now, userId, sessionId },
    });
  });

  it("expira a sessão e exige aal2 de quem precisa de MFA", () => {
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie: session(now - STAFF_IDLE_MS),
        profile: profile(["CONTENT_ADMIN"]),
        aal: "aal1",
        hasVerifiedTotp: false,
        roles: ADMIN_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "expired" });
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie: session(),
        profile: profile(["SUPER_ADMIN"]),
        aal: "aal1",
        hasVerifiedTotp: false,
        roles: ADMIN_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "mfa-setup" });
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie: session(),
        profile: profile(["CLINIC_ADMIN"]),
        aal: "aal1",
        hasVerifiedTotp: true,
        roles: CONSULTORIO_ROLES,
        now,
      }),
    ).toMatchObject({ ok: false, reason: "mfa-verify" });
    expect(
      decideStaffAccess({
        userId,
        sessionId,
        cookie: session(),
        profile: profile(["CONTENT_ADMIN"]),
        aal: "aal1",
        hasVerifiedTotp: false,
        roles: ADMIN_ROLES,
        now,
      }).ok,
    ).toBe(true);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("origem e varredura das rotas", () => {
  it("só aceita a origem do site", () => {
    expect(sameOrigin("https://adrielli.example", "https://adrielli.example")).toBe(true);
    expect(sameOrigin("https://outro.example", "https://adrielli.example")).toBe(false);
    expect(sameOrigin(null, "https://adrielli.example")).toBe(false);
  });

  it("reprova rota sem requireStaff e rota mutável sem a origem", () => {
    expect(
      sourceDeclaresStaffGuard("export default function Page() { return null }"),
    ).toBe(false);
    expect(sourceDeclaresStaffGuard("await requireStaff({ roles })")).toBe(true);
    expect(
      sourceDeclaresOriginGuard("export async function POST() { return null }"),
    ).toBe(false);
    expect(
      sourceDeclaresOriginGuard("export async function POST() { sameOrigin(null, '') }"),
    ).toBe(true);
  });

  it("encontra requireStaff em cada rota de admin e consultório", () => {
    const roots = ["src/app/admin", "src/app/consultorio"].map((dir) =>
      path.join(process.cwd(), dir),
    );
    const files = roots.flatMap((dir) => walk(dir));
    const guarded = files.filter((file) => isGuardedRouteFile(file));
    expect(guarded.length).toBeGreaterThan(0);
    for (const file of guarded) {
      const source = readFileSync(file, "utf8");
      expect(sourceDeclaresStaffGuard(source), file).toBe(true);
      expect(sourceDeclaresOriginGuard(source), file).toBe(true);
    }
  });
});
