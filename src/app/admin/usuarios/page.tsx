import * as Sentry from "@sentry/nextjs";

import { USER_ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { listStaff } from "@/modules/identity/server/staff-directory";

import { UsersPanel } from "./users-panel";

export const instant = false;

export default async function AdminUsersPage() {
  const actor = await requireStaff({ roles: USER_ADMIN_ROLES });
  const items = await listStaff().catch((error: unknown) => {
    Sentry.captureException(error);
    return null;
  });
  if (!items) return <p role="alert">Não foi possível carregar os usuários.</p>;
  return <UsersPanel items={items} actorId={actor.userId} />;
}
