import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export default async function ConsultorioPage() {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-[28rem] px-4 py-16">
        <h1 className="text-3xl">Consultório</h1>
      </main>
    </div>
  );
}
