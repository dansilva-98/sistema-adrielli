const CRLF = "\r\n";
const ICS_LINE_OCTETS = 75;
const CLINIC_TZID = "America/Sao_Paulo";

export type CalendarEvent = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  location: string;
};

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

export function calendarEventTitle(
  fullName: string,
  preferredName: string | null,
): string {
  const given = preferredName?.trim() || words(fullName)[0] || "";
  const parts = words(fullName);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const letter = last ? [...last][0] : "";
  if (!letter) return given;
  return `${given} ${letter.toLocaleUpperCase("pt-BR")}.`;
}

export function calendarLocation(locationName: string, locationAddress: string): string {
  return [locationName, locationAddress]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= ICS_LINE_OCTETS) return line;
  const chunks: string[] = [];
  let offset = 0;
  let limit = ICS_LINE_OCTETS;
  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);
    while (end > offset && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    if (end === offset) end = Math.min(offset + limit, bytes.length);
    chunks.push(bytes.subarray(offset, end).toString("utf8"));
    offset = end;
    limit = ICS_LINE_OCTETS - 1;
  }
  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`)).join(CRLF);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatIcsUtc(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

export function formatIcsLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TZID,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}${pick("month")}${pick("day")}T${pick("hour")}${pick("minute")}${pick("second")}`;
}

function timezoneBlock(): string[] {
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${CLINIC_TZID}`,
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:-03",
    "DTSTART:20190217T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

function eventLines(event: CalendarEvent, stamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.id}@adrielliflores.com.br`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${CLINIC_TZID}:${formatIcsLocal(event.startsAt)}`,
    `DTEND;TZID=${CLINIC_TZID}:${formatIcsLocal(event.endsAt)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Sessão em 1 hora",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
  );
  return lines;
}

export function buildIcsCalendar(events: CalendarEvent[], now = new Date()): string {
  const stamp = formatIcsUtc(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Adrielli Flores//Agenda//PT",
    "CALSCALE:GREGORIAN",
    ...timezoneBlock(),
  ];
  for (const event of events) lines.push(...eventLines(event, stamp));
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join(CRLF)}${CRLF}`;
}
