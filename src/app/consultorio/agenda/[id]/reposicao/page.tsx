import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { addClinicDays, todayInClinic } from "@/modules/clinic/format";
import { ClinicRuleError } from "@/modules/clinic/patients";
import {
  readAgendaSettings,
  readAppointmentDetail,
} from "@/modules/clinic/server/agenda-read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { MakeupForm } from "./makeup-form";

export const instant = false;

export const metadata = { title: { absolute: "Agendar reposição" } };

export default async function MakeupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let appointment;
  try {
    appointment = await readAppointmentDetail(id);
  } catch (error) {
    if (error instanceof ClinicRuleError && error.code === "not-found") notFound();
    throw error;
  }
  if (appointment.status !== "missed_notified" || appointment.hasActiveMakeup) {
    notFound();
  }
  const settings = await readAgendaSettings();
  const today = todayInClinic();

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <Link
        href={`/consultorio/agenda/${appointment.id}`}
        className="min-h-11 text-sm underline-offset-4 hover:underline"
      >
        Voltar para a sessão
      </Link>
      <h2 className="font-serif text-2xl">Agendar reposição</h2>
      <p className="break-words text-lg font-medium">{appointment.patientName}</p>
      <MakeupForm
        appointmentId={appointment.id}
        patientId={appointment.patientId}
        date={addClinicDays(today, 7)}
        time=""
        durationMinutes={settings.defaultDurationMinutes}
      />
    </section>
  );
}
