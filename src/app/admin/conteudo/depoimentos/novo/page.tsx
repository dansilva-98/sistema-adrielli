import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { TestimonialForm } from "../testimonial-form";

export const instant = false;

export default async function NewTestimonialPage() {
  await requireStaff({ roles: ADMIN_ROLES });
  return <TestimonialForm item={null} />;
}
