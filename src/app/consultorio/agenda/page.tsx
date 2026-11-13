import Link from "next/link";

import { APPOINTMENT_STATUS_LABELS } from "@/modules/clinic/appointment-status";
import {
  AGENDA_VIEWS,
  agendaBoardDays,
  agendaBoardStart,
  agendaHref,
  appointmentOverlapsClinicDay,
  clinicDateList,
  parseAgendaDate,
  parseAgendaView,
  shiftAgendaDate,
  weekdayHeading,
} from "@/modules/clinic/agenda-view";
import {
  formatClinicClock,
  formatClinicDate,
  todayInClinic,
} from "@/modules/clinic/format";
import { readAgendaBoard } from "@/modules/clinic/server/agenda-read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

export const metadata = { title: { absolute: "Agenda" } };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string; data?: string }>;
}) {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  const query = await searchParams;
  const today = todayInClinic();
  const view = parseAgendaView(query.visao);
  const date = parseAgendaDate(query.data, today);
  const start = agendaBoardStart(view, date);
  const days = clinicDateList(start, agendaBoardDays(view));
  const appointments = await readAgendaBoard({ view, date });
  const previous = shiftAgendaDate(view, date, -1);
  const next = shiftAgendaDate(view, date, 1);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-2xl">Agenda</h2>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/consultorio/agenda/nova?data=${date}`}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-3 text-center text-sm font-medium text-primary-foreground"
          >
            Nova sessão
          </Link>
          <Link
            href="/consultorio/agenda/configuracoes"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-3 text-center text-sm font-medium"
          >
            Configurações
          </Link>
        </div>
      </div>
      <nav aria-label="Visão da agenda" className="grid grid-cols-3 gap-1">
        {AGENDA_VIEWS.map((item) => {
          const current = item.id === view;
          const href = agendaHref(item.id, date);
          return (
            <Link
              key={item.id}
              href={href}
              aria-label={item.title}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "inline-flex h-11 items-center justify-center rounded-md bg-support px-1 text-center text-sm font-medium text-support-foreground"
                  : "inline-flex h-11 items-center justify-center rounded-md border border-border px-1 text-center text-sm"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Período" className="grid grid-cols-3 gap-1">
        <Link
          href={agendaHref(view, previous)}
          className="inline-flex h-11 items-center justify-center rounded-md border border-border text-sm"
        >
          Anterior
        </Link>
        <Link
          href={agendaHref(view, today)}
          className="inline-flex h-11 items-center justify-center rounded-md border border-border text-sm font-medium"
        >
          Hoje
        </Link>
        <Link
          href={agendaHref(view, next)}
          className="inline-flex h-11 items-center justify-center rounded-md border border-border text-sm"
        >
          Próximo
        </Link>
      </nav>
      <div className="flex flex-col gap-4">
        {days.map((day) => {
          const items = appointments.filter((appointment) =>
            appointmentOverlapsClinicDay(appointment.startsAt, appointment.endsAt, day),
          );
          return (
            <section key={day} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium capitalize">
                {view === "dia" ? formatClinicDate(day) : weekdayHeading(day)}
              </h3>
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm">
                  Nenhuma sessão neste dia
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((appointment) => (
                    <li key={appointment.id}>
                      <Link
                        href={`/consultorio/agenda/${appointment.id}`}
                        className="flex min-h-11 min-w-0 flex-col gap-1 rounded-xl border border-border p-4"
                      >
                        <p className="text-sm text-muted">
                          {formatClinicClock(appointment.startsAt)} ·{" "}
                          {APPOINTMENT_STATUS_LABELS[appointment.status]}
                        </p>
                        <p className="break-words text-base font-medium">
                          {appointment.patientName}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
