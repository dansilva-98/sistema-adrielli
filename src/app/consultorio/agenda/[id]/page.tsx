import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  APPOINTMENT_MODALITY_LABELS,
  APPOINTMENT_STATUS_LABELS,
  canOfferMakeup,
  canShowUndo,
} from "@/modules/clinic/appointment-status";
import { formatClinicSlotLabel, todayInClinic } from "@/modules/clinic/format";
import { ClinicRuleError } from "@/modules/clinic/patients";
import {
  readAppointmentDetail,
  readPatientPackages,
} from "@/modules/clinic/server/agenda-read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { AppointmentDetailActions } from "./appointment-detail";
import { AppointmentPackageForm } from "./appointment-package-form";

export const instant = false;

export const metadata = { title: { absolute: "Sessão" } };

export default async function AppointmentPage({
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
  const showUndo = canShowUndo(
    appointment.status,
    appointment.statusChangedAt,
    new Date(),
    appointment.hasActiveMakeup,
  );
  const scheduled = appointment.status === "scheduled";
  const offerMakeup = canOfferMakeup(appointment.status, appointment.hasActiveMakeup);
  const packages =
    scheduled && !appointment.makeupOfId
      ? await readPatientPackages(appointment.patientId)
      : [];

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <Link
        href="/consultorio/agenda"
        className="min-h-11 text-sm underline-offset-4 hover:underline"
      >
        Voltar para a agenda
      </Link>
      <div>
        <h2 className="font-serif text-2xl break-words">{appointment.patientName}</h2>
        <p className="text-sm text-muted">
          {formatClinicSlotLabel(appointment.startsAt)} ·{" "}
          {APPOINTMENT_STATUS_LABELS[appointment.status]} ·{" "}
          {APPOINTMENT_MODALITY_LABELS[appointment.modality]}
        </p>
      </div>
      <Link
        href={`/consultorio/pacientes/${appointment.patientId}`}
        className="inline-flex h-11 items-center justify-center rounded-lg border border-border text-sm font-medium"
      >
        Ficha do paciente
      </Link>
      {appointment.makeupOfId ? <p className="text-sm">Reposição</p> : null}
      {scheduled && !appointment.makeupOfId ? (
        <AppointmentPackageForm
          appointmentId={appointment.id}
          patientId={appointment.patientId}
          packageId={appointment.packageId}
          packages={packages}
          today={todayInClinic()}
        />
      ) : null}
      {appointment.notes ? (
        <p className="whitespace-pre-wrap break-words text-sm">{appointment.notes}</p>
      ) : null}
      {appointment.status === "cancelled" && appointment.cancelReason ? (
        <p className="text-sm">Motivo: {appointment.cancelReason}</p>
      ) : null}
      {appointment.status === "rescheduled" && appointment.rescheduledToId ? (
        <Link
          href={`/consultorio/agenda/${appointment.rescheduledToId}`}
          className="min-h-11 text-sm underline-offset-4 hover:underline"
        >
          Ver a sessão remarcada
        </Link>
      ) : null}
      {scheduled ? (
        <Link
          href={`/consultorio/agenda/${appointment.id}/remarcar`}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border text-sm font-medium"
        >
          Remarcar
        </Link>
      ) : null}
      {offerMakeup ? (
        <Link
          href={`/consultorio/agenda/${appointment.id}/reposicao`}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-support px-3 text-center text-sm font-medium text-support-foreground"
        >
          Agendar reposição
        </Link>
      ) : null}
      <AppointmentDetailActions
        appointmentId={appointment.id}
        patientId={appointment.patientId}
        scheduled={scheduled}
        showUndo={showUndo}
        cancelReason={appointment.cancelReason ?? ""}
      />
    </section>
  );
}
