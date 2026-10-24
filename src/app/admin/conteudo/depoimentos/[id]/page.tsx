import { sql } from "@/db/client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { loadStaffTestimonial } from "@/modules/content/queries";

import { isRecordId, loadOrNull } from "../../load";
import { TestimonialForm } from "../testimonial-form";

export const instant = false;

export default async function EditTestimonialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff({ roles: ADMIN_ROLES });
  const { id } = await params;
  if (!isRecordId(id)) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  const item = await loadOrNull(loadStaffTestimonial(sql, id));
  if (!item) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  return <TestimonialForm item={item} />;
}
