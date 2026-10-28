import Link from "next/link";

import { todayInClinic } from "@/modules/clinic/format";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { PatientForm } from "../patient-form";

export const instant = false;

export const metadata = { title: { absolute: "Novo paciente" } };

export default async function NewPatientPage() {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  return (
    <section className="flex flex-col gap-4">
      <Link
        href="/consultorio/pacientes"
        className="min-h-11 text-sm underline-offset-4 hover:underline"
      >
        Voltar para pacientes
      </Link>
      <h2 className="font-serif text-2xl">Novo paciente</h2>
      <PatientForm today={todayInClinic()} />
    </section>
  );
}
