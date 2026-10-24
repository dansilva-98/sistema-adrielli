import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { FaqForm } from "../faq-form";

export const instant = false;

export default async function NewFaqPage() {
  await requireStaff({ roles: ADMIN_ROLES });
  return <FaqForm item={null} />;
}
