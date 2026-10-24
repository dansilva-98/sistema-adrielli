import { sql } from "@/db/client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { loadStaffFaqItem } from "@/modules/content/queries";

import { isRecordId, loadOrNull } from "../../load";
import { FaqForm } from "../faq-form";

export const instant = false;

export default async function EditFaqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff({ roles: ADMIN_ROLES });
  const { id } = await params;
  if (!isRecordId(id)) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  const item = await loadOrNull(loadStaffFaqItem(sql, id));
  if (!item) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  return <FaqForm item={item} />;
}
