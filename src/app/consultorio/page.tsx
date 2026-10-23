import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export default async function ConsultorioPage() {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl">Dashboard</h2>
      <p>Em construção</p>
    </section>
  );
}
