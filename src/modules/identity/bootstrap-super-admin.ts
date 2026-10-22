import postgres from "postgres";
import { z } from "zod";

const emailSchema = z.email();
const userIdSchema = z.uuid();
const auditMetadataSchema = z.object({}).strict();

const BOOTSTRAP_LOCK = 8142026;

export class BootstrapRefusedError extends Error {
  constructor() {
    super("Recusado: já existe um SUPER_ADMIN.");
    this.name = "BootstrapRefusedError";
  }
}

export function readBootstrapEmail(argv: readonly string[]): string {
  const index = argv.indexOf("--email");
  const email = index >= 0 ? argv[index + 1] : undefined;
  if (!email || email.startsWith("--")) {
    throw new Error("Uso: pnpm admin:bootstrap -- --email <e-mail>");
  }
  return emailSchema.parse(email.trim().toLowerCase());
}

export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim();
  return local ? local : "Administrador";
}

export async function inviteStaffByEmail(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  email: string;
  fetchImpl?: typeof fetch;
}): Promise<{ id: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(new URL("/auth/v1/invite", input.supabaseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.serviceRoleKey}`,
      apikey: input.serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: input.email }),
  });
  if (!response.ok) {
    throw new Error("Recusado: o convite no Supabase Auth falhou.");
  }
  return { id: await readUserId(response) };
}

export async function cancelStaffInvite(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    new URL(`/auth/v1/admin/users/${input.userId}`, input.supabaseUrl),
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${input.serviceRoleKey}`,
        apikey: input.serviceRoleKey,
      },
    },
  );
  if (!response.ok) {
    throw new Error("Recusado: não foi possível desfazer o convite.");
  }
}

export async function bootstrapSuperAdmin(input: {
  sql: ReturnType<typeof postgres>;
  email: string;
  invite: (email: string) => Promise<{ id: string }>;
  cancelInvite?: (userId: string) => Promise<void>;
}): Promise<{ userId: string }> {
  const email = emailSchema.parse(input.email.trim().toLowerCase());
  const metadata = auditMetadataSchema.parse({});

  return input.sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`;
    const existing = await tx<{ exists: boolean }[]>`
      select exists (
        select 1 from identity.user_roles where role = 'SUPER_ADMIN'
      ) as exists
    `;
    if (existing[0]?.exists) throw new BootstrapRefusedError();

    const invited = await input.invite(email);
    const userId = userIdSchema.parse(invited.id);
    try {
      await tx`
        insert into identity.users (id, kind, email, display_name)
        values (${userId}::uuid, 'STAFF', ${email}, ${displayNameFromEmail(email)})
      `;
      await tx`
        insert into identity.user_roles (user_id, role)
        values (${userId}::uuid, 'SUPER_ADMIN')
      `;
      await tx`
        insert into audit.audit_log (action, entity_type, entity_id, metadata)
        values ('user.bootstrap', 'user', ${userId}::uuid, ${JSON.stringify(metadata)}::jsonb)
      `;
    } catch (error) {
      await input.cancelInvite?.(userId).catch(() => undefined);
      throw error;
    }
    return { userId };
  });
}

async function readUserId(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "id" in body &&
      typeof body.id === "string"
    ) {
      return body.id;
    }
  } catch {
    // A resposta sem JSON vira o mesmo erro genérico abaixo.
  }
  throw new Error("Recusado: o convite não devolveu o usuário.");
}
