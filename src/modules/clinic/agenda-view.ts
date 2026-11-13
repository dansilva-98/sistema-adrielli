import {
  addClinicDays,
  clinicTimeValue,
  formatClinicDate,
  isRealDate,
  mondayOfClinicWeek,
  todayInClinic,
} from "./format";

export type AgendaView = "dia" | "semana" | "lista";

export const AGENDA_VIEWS: { id: AgendaView; label: string; title: string }[] = [
  { id: "dia", label: "Dia", title: "Dia" },
  { id: "semana", label: "Semana", title: "Semana" },
  { id: "lista", label: "14 dias", title: "Próximos 14 dias" },
];

export function parseAgendaView(value: string | undefined): AgendaView {
  if (value === "semana" || value === "lista") return value;
  return "dia";
}

export function parseAgendaDate(value: string | undefined, today: string): string {
  return value && isRealDate(value) ? value : today;
}

export function agendaHref(view: AgendaView, date: string): string {
  const params = new URLSearchParams();
  if (view !== "dia") params.set("visao", view);
  params.set("data", date);
  return `/consultorio/agenda?${params.toString()}`;
}

export function shiftAgendaDate(
  view: AgendaView,
  date: string,
  direction: -1 | 1,
): string {
  const days = view === "dia" ? 1 : view === "semana" ? 7 : 14;
  return addClinicDays(date, days * direction);
}

export function agendaBoardStart(view: AgendaView, date: string): string {
  return view === "semana" ? mondayOfClinicWeek(date) : date;
}

export function agendaBoardDays(view: AgendaView): number {
  return view === "dia" ? 1 : view === "semana" ? 7 : 14;
}

export function clinicDateList(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addClinicDays(start, index));
}

export function weekdayHeading(date: string): string {
  if (!isRealDate(date)) return "";
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${weekday} ${formatClinicDate(date)}`;
}

export function packageUsageLabel(consumed: number, totalSessions: number): string {
  return `usadas ${consumed} de ${totalSessions}`;
}

export function remainingSessionWarning(remaining: number): string | null {
  return remaining === 1 ? "Falta 1 sessão neste pacote." : null;
}

export function pendingMakeupsLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 reposição pendente" : `${count} reposições pendentes`;
}

export function appointmentOverlapsClinicDay(
  startsAt: Date | string,
  endsAt: Date | string,
  day: string,
): boolean {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const startDay = todayInClinic(start);
  const endDay = todayInClinic(end);
  if (startDay === day) return true;
  if (endDay === day && clinicTimeValue(end) !== "00:00") return true;
  return startDay < day && day < endDay;
}
