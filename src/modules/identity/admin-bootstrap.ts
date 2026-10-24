import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import postgres from "postgres";

import { parseClientEnv, parseServerEnv } from "../../lib/env.ts";
import {
  bootstrapLogMessage,
  bootstrapSuperAdmin,
  cancelStaffInvite,
  inviteStaffByEmail,
  readBootstrapEmail,
} from "./bootstrap-super-admin.ts";

function loadLocalEnv(): void {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  else if (existsSync(".env")) loadEnvFile(".env");
}

async function main(): Promise<void> {
  loadLocalEnv();
  const email = readBootstrapEmail(process.argv.slice(2));
  const server = parseServerEnv(process.env);
  const client = parseClientEnv(process.env);
  const sql = postgres(server.DATABASE_URL, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
  });
  try {
    await bootstrapSuperAdmin({
      sql,
      email,
      invite: (invitedEmail) =>
        inviteStaffByEmail({
          supabaseUrl: client.NEXT_PUBLIC_SUPABASE_URL,
          serviceRoleKey: server.SUPABASE_SERVICE_ROLE_KEY,
          email: invitedEmail,
        }),
      cancelInvite: (userId) =>
        cancelStaffInvite({
          supabaseUrl: client.NEXT_PUBLIC_SUPABASE_URL,
          serviceRoleKey: server.SUPABASE_SERVICE_ROLE_KEY,
          userId,
        }),
    });
    console.log("SUPER_ADMIN criado.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("src/modules/identity/admin-bootstrap.ts")) {
  main().catch((error: unknown) => {
    const message = bootstrapLogMessage(error);
    console.error(message);
    process.exit(1);
  });
}
