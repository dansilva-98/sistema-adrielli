import Link from "next/link";

import { readAgendaSettings } from "@/modules/clinic/server/agenda-read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { AgendaSettingsForm } from "./settings-form";

export const instant = false;

export const metadata = { title: { absolute: "Configurações da agenda" } };

export default async function AgendaSettingsPage() {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  const settings = await readAgendaSettings();
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <Link
        href="/consultorio/agenda"
        className="min-h-11 text-sm underline-offset-4 hover:underline"
      >
        Voltar para a agenda
      </Link>
      <h2 className="font-serif text-2xl">Configurações da agenda</h2>
      <AgendaSettingsForm settings={settings} />
    </section>
  );
}
