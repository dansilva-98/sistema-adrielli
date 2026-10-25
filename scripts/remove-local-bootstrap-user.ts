import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";

import { assertLocalDatabaseAllowed } from "../src/db/seed.ts";

const CI_BOOTSTRAP_EMAIL = "ci-primeiro-admin@example.com";

async function main(): Promise<void> {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (email !== CI_BOOTSTRAP_EMAIL) {
    throw new Error("Recusado: este script só remove o usuário de teste do CI.");
  }
  const ownerUrl = process.env.MIGRATIONS_DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ownerUrl || !supabaseUrl || !serviceRoleKey) {
    throw new Error("Recusado: ambiente local incompleto.");
  }
  assertLocalDatabaseAllowed(process.env.APP_ENV, ownerUrl);

  const sql = postgres(ownerUrl, { max: 1, prepare: false, connect_timeout: 5 });
  try {
    const rows = await sql<{ id: string }[]>`
      select id from auth.users where lower(email) = ${email}
    `;
    const userId = rows[0]?.id;
    if (!userId) return;

    await sql`
      update identity.user_roles set granted_by = null where granted_by = ${userId}::uuid
    `;
    await sql`delete from identity.user_roles where user_id = ${userId}::uuid`;
    await sql`delete from identity.users where id = ${userId}::uuid`;
    const response = await fetch(new URL(`/auth/v1/admin/users/${userId}`, supabaseUrl), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    });
    if (!response.ok)
      throw new Error("Recusado: não foi possível remover o usuário de teste.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("scripts/remove-local-bootstrap-user.ts")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "limpeza falhou";
    console.error(message.includes("@") ? "limpeza falhou" : message);
    process.exit(1);
  });
}
