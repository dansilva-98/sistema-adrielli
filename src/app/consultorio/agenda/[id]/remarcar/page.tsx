import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { clinicTimeValue, durationMinutes, todayInClinic } from "@/modules/clinic/format";
import { ClinicRuleError } from "@/modules/clinic/patients";
import { readAppointmentDetail } from "@/modules/clinic/server/agenda-read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { RescheduleForm } from "./reschedule-form";

export const instant = false;

export const metadata = { title: { absolute: "Remarcar sessão" } };

export default async function ReschedulePage({
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
  if (appointment.status !== "scheduled") notFound();
  const starts =
    appointment.startsAt instanceof Date
      ? appointment.startsAt
      : new Date(appointment.startsAt);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <Link
        href={`/consultorio/agenda/${appointment.id}`}
        className="min-h-11 text-sm underline-offset-4 hover:underline"
      >
        Voltar para a sessão
      </Link>
      <h2 className="font-serif text-2xl">Remarcar</h2>
      <p className="break-words text-lg font-medium">{appointment.patientName}</p>
      <RescheduleForm
        appointmentId={appointment.id}
        patientId={appointment.patientId}
        date={todayInClinic(starts)}
        time={clinicTimeValue(starts)}
        durationMinutes={durationMinutes(appointment.startsAt, appointment.endsAt)}
        notes={appointment.notes ?? ""}
      />
    </section>
  );
}
