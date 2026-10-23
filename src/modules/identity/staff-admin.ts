import type postgres from "postgres";
import { z } from "zod";

import { isStaffRole, STAFF_ROLES, type StaffRole } from "@/modules/identity/access";

const nameSchema = z.string().trim().min(1).max(80);
const emailSchema = z.email();
const rolesSchema = z.array(z.enum(STAFF_ROLES)).min(1);

export class StaffAdminError extends Error {
  readonly code: "self" | "last" | "roles" | "missing" | "invalid";

  constructor(code: StaffAdminError["code"]) {
    super(code);
    this.name = "StaffAdminError";
    this.code = code;
  }
}

export function refusalForDisable(input: {
  actorId: string;
  targetId: string;
  activeSuperAdminIds: readonly string[];
}): "self" | "last" | null {
  if (input.actorId === input.targetId) return "self";
  if (
    input.activeSuperAdminIds.length === 1 &&
    input.activeSuperAdminIds[0] === input.targetId
  ) {
    return "last";
  }
  return null;
}

export function refusalForRoles(input: {
  targetId: string;
  nextRoles: readonly StaffRole[];
  activeSuperAdminIds: readonly string[];
}): "last" | "roles" | null {
  if (input.nextRoles.length === 0) return "roles";
  const keepsSuperAdmin = input.nextRoles.includes("SUPER_ADMIN");
  if (
    !keepsSuperAdmin &&
    input.activeSuperAdminIds.length === 1 &&
    input.activeSuperAdminIds[0] === input.targetId
  ) {
    return "last";
  }
  return null;
}

export function parseStaffInvite(input: {
  name: string;
  email: string;
  roles: readonly string[];
}): { name: string; email: string; roles: StaffRole[] } {
  const name = nameSchema.safeParse(input.name);
  const email = emailSchema.safeParse(input.email.trim().toLowerCase());
  const roles = rolesSchema.safeParse([...new Set(input.roles)]);
  if (!name.success || !email.success || !roles.success) {
    throw new StaffAdminError("invalid");
  }
  return { name: name.data, email: email.data, roles: roles.data };
}

type Tx = postgres.TransactionSql;

async function lockActiveSuperAdmins(tx: Tx): Promise<string[]> {
  const rows = await tx<{ id: string }[]>`
    select u.id
    from identity.users u
    inner join identity.user_roles r on r.user_id = u.id
    where u.kind = 'STAFF'
      and u.disabled_at is null
      and r.role = 'SUPER_ADMIN'
    order by u.id
    for update of u
  `;
  return rows.map((row) => row.id);
}

async function insertAudit(
  tx: Tx,
  input: {
    actorId: string;
    action: string;
    targetId: string;
    ip: string | null;
  },
): Promise<void> {
  await tx`
    insert into audit.audit_log (actor_user_id, action, entity_type, entity_id, ip, metadata)
    values (
      ${input.actorId}::uuid,
      ${input.action},
      'user',
      ${input.targetId}::uuid,
      ${input.ip}::inet,
      '{}'::jsonb
    )
  `;
}

export async function disableStaff(
  sql: postgres.Sql,
  input: {
    actorId: string;
    targetId: string;
    ip: string | null;
    blockAuth: (userId: string) => Promise<void>;
    unblockAuth: (userId: string) => Promise<void>;
    report: (error: unknown) => void;
  },
): Promise<void> {
  if (input.actorId === input.targetId) throw new StaffAdminError("self");
  await sql.begin(async (tx) => {
    const active = await lockActiveSuperAdmins(tx);
    const refusal = refusalForDisable({
      actorId: input.actorId,
      targetId: input.targetId,
      activeSuperAdminIds: active,
    });
    if (refusal) throw new StaffAdminError(refusal);
  });
  try {
    await input.blockAuth(input.targetId);
    await sql.begin(async (tx) => {
      const active = await lockActiveSuperAdmins(tx);
      const refusal = refusalForDisable({
        actorId: input.actorId,
        targetId: input.targetId,
        activeSuperAdminIds: active,
      });
      if (refusal) throw new StaffAdminError(refusal);
      const updated = await tx<{ id: string }[]>`
        update identity.users
        set disabled_at = now()
        where id = ${input.targetId}::uuid
          and kind = 'STAFF'
          and disabled_at is null
        returning id
      `;
      if (updated.length === 0) throw new StaffAdminError("missing");
      await insertAudit(tx, {
        actorId: input.actorId,
        action: "user.disabled",
        targetId: input.targetId,
        ip: input.ip,
      });
    });
  } catch (error) {
    try {
      await input.unblockAuth(input.targetId);
    } catch (undoError) {
      input.report(undoError);
    }
    throw error;
  }
}

export async function enableStaff(
  sql: postgres.Sql,
  input: {
    actorId: string;
    targetId: string;
    ip: string | null;
    unblockAuth: (userId: string) => Promise<void>;
    blockAuth: (userId: string) => Promise<void>;
    report: (error: unknown) => void;
  },
): Promise<void> {
  await input.unblockAuth(input.targetId);
  try {
    await sql.begin(async (tx) => {
      const updated = await tx<{ id: string }[]>`
        update identity.users
        set disabled_at = null
        where id = ${input.targetId}::uuid
          and kind = 'STAFF'
          and disabled_at is not null
        returning id
      `;
      if (updated.length === 0) throw new StaffAdminError("missing");
      await insertAudit(tx, {
        actorId: input.actorId,
        action: "user.enabled",
        targetId: input.targetId,
        ip: input.ip,
      });
    });
  } catch (error) {
    try {
      await input.blockAuth(input.targetId);
    } catch (undoError) {
      input.report(undoError);
    }
    throw error;
  }
}

export async function replaceStaffRoles(
  sql: postgres.Sql,
  input: {
    actorId: string;
    targetId: string;
    roles: readonly StaffRole[];
    ip: string | null;
  },
): Promise<void> {
  const nextRoles = rolesSchema.parse([...new Set(input.roles)]);
  await sql.begin(async (tx) => {
    const active = await lockActiveSuperAdmins(tx);
    const target = await tx<{ id: string }[]>`
      select id from identity.users
      where id = ${input.targetId}::uuid and kind = 'STAFF'
      for update
    `;
    if (target.length === 0) throw new StaffAdminError("missing");
    const refusal = refusalForRoles({
      targetId: input.targetId,
      nextRoles,
      activeSuperAdminIds: active,
    });
    if (refusal) throw new StaffAdminError(refusal);
    const currentRows = await tx<{ role: string }[]>`
      select role from identity.user_roles
      where user_id = ${input.targetId}::uuid
    `;
    const current = currentRows.map((row) => row.role).filter(isStaffRole);
    const granted = nextRoles.filter((role) => !current.includes(role));
    const revoked = current.filter((role) => !nextRoles.includes(role));
    for (const role of revoked) {
      await tx`
        delete from identity.user_roles
        where user_id = ${input.targetId}::uuid
          and role = ${role}::identity.staff_role
      `;
      await insertAudit(tx, {
        actorId: input.actorId,
        action: "user.role.revoked",
        targetId: input.targetId,
        ip: input.ip,
      });
    }
    for (const role of granted) {
      await tx`
        insert into identity.user_roles (user_id, role, granted_by)
        values (
          ${input.targetId}::uuid,
          ${role}::identity.staff_role,
          ${input.actorId}::uuid
        )
      `;
      await insertAudit(tx, {
        actorId: input.actorId,
        action: "user.role.granted",
        targetId: input.targetId,
        ip: input.ip,
      });
    }
  });
}

export async function inviteStaffMember(
  sql: postgres.Sql,
  input: {
    actorId: string;
    name: string;
    email: string;
    roles: readonly StaffRole[];
    ip: string | null;
    invite: (email: string) => Promise<{ id: string }>;
    cancelInvite: (userId: string) => Promise<void>;
    report: (error: unknown) => void;
  },
): Promise<void> {
  const parsed = parseStaffInvite(input);
  const invited = await input.invite(parsed.email);
  const userId = z.uuid().parse(invited.id);
  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into identity.users (id, kind, email, display_name)
        values (${userId}::uuid, 'STAFF', ${parsed.email}, ${parsed.name})
      `;
      for (const role of parsed.roles) {
        await tx`
          insert into identity.user_roles (user_id, role, granted_by)
          values (
            ${userId}::uuid,
            ${role}::identity.staff_role,
            ${input.actorId}::uuid
          )
        `;
      }
      await insertAudit(tx, {
        actorId: input.actorId,
        action: "user.invited",
        targetId: userId,
        ip: input.ip,
      });
      for (let index = 0; index < parsed.roles.length; index += 1) {
        await insertAudit(tx, {
          actorId: input.actorId,
          action: "user.role.granted",
          targetId: userId,
          ip: input.ip,
        });
      }
    });
  } catch (error) {
    try {
      await input.cancelInvite(userId);
    } catch (cancelError) {
      input.report(cancelError);
    }
    throw error;
  }
}
