import { headers } from "next/headers";
import Link from "next/link";
import { z } from "zod";

import { sql } from "@/db/client";
import { parseAgendaDate } from "@/modules/clinic/agenda-view";
import { displayName, isRealDate, todayInClinic } from "@/modules/clinic/format";
import { readNewAppointmentForm } from "@/modules/clinic/server/agenda-read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { clientIp } from "@/modules/identity/staff-session";

import { AppointmentForm } from "./appointment-form";
import { AgendaPatientPicker } from "./patient-picker";

export const instant = false;

export const metadata = { title: { absolute: "Nova sessão" } };

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string; data?: string }>;
}) {
  const access = await requireStaff({ roles: CONSULTORIO_ROLES });
  const query = await searchParams;
  const today = todayInClinic();
  const date = parseAgendaDate(query.data, today);
  const patientId =
    query.paciente && z.uuid().safeParse(query.paciente).success ? query.paciente : "";
  const loaded = patientId
    ? await readNewAppointmentForm(
        sql,
        { userId: access.userId, ip: clientIp(await headers()) },
        patientId,
      )
    : null;
  const patient = loaded?.patient ?? null;
  const openPackages = (loaded?.packages ?? []).filter(
    (item) => item.closedAt === null && item.remaining > 0,
  );

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <Link
        href={
          isRealDate(date) ? `/consultorio/agenda?data=${date}` : "/consultorio/agenda"
        }
        className="min-h-11 text-sm underline-offset-4 hover:underline"
      >
        Voltar para a agenda
      </Link>
      <h2 className="font-serif text-2xl">Nova sessão</h2>
      {patient && loaded ? (
        <div className="flex flex-col gap-3">
          <p className="break-words text-lg font-medium">
            {displayName(patient.fullName, patient.preferredName)}
          </p>
          <Link
            href={`/consultorio/agenda/nova?data=${date}`}
            className="min-h-11 text-sm underline-offset-4 hover:underline"
          >
            Trocar paciente
          </Link>
          <AppointmentForm
            patientId={patient.id}
            date={date}
            durationMinutes={loaded.settings.defaultDurationMinutes}
            packages={openPackages}
            today={today}
          />
        </div>
      ) : (
        <AgendaPatientPicker date={date} patients={[]} />
      )}
    </section>
  );
}
