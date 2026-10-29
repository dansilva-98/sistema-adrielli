import Link from "next/link";
import { redirect } from "next/navigation";

import { todayInClinic } from "@/modules/clinic/format";
import { readPatientList } from "@/modules/clinic/server/read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { PatientSearch } from "./patient-search";

export const instant = false;

export const metadata = { title: { absolute: "Pacientes" } };

function listHref(archived: boolean): string {
  return archived
    ? "/consultorio/pacientes?situacao=arquivados"
    : "/consultorio/pacientes";
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string }>;
}) {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  const params = await searchParams;
  const archived = params.situacao === "arquivados";
  if (params.q !== undefined) redirect(listHref(archived));
  const patients = await readPatientList({ query: "", archived });
  const today = todayInClinic();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-serif text-2xl">Pacientes</h2>
      <Link
        href="/consultorio/pacientes/novo"
        className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Novo paciente
      </Link>
      <PatientSearch
        key={archived ? "archived" : "active"}
        archived={archived}
        today={today}
        patients={patients}
      />
    </section>
  );
}
