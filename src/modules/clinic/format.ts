const CLINIC_TIME_ZONE = "America/Sao_Paulo";

export const RELATIONSHIPS = [
  ["MOTHER", "Mãe"],
  ["FATHER", "Pai"],
  ["GRANDMOTHER", "Avó"],
  ["SELF", "O próprio paciente"],
  ["OTHER", "Outro"],
] as const;

export const ATTACHMENT_CATEGORIES = [
  ["CLINICAL_REPORT", "Laudo"],
  ["SCHOOL_REPORT", "Relatório escolar"],
  ["ASSESSMENT", "Avaliação"],
  ["PERSONAL_DOCUMENT", "Documento pessoal"],
  ["OTHER", "Outro"],
] as const;

export type GuardianRelationship = (typeof RELATIONSHIPS)[number][0];
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number][0];

const relationshipLabels = Object.fromEntries(RELATIONSHIPS) as Record<
  GuardianRelationship,
  string
>;
const categoryLabels = Object.fromEntries(ATTACHMENT_CATEGORIES) as Record<
  AttachmentCategory,
  string
>;

export function relationshipLabel(value: GuardianRelationship): string {
  return relationshipLabels[value];
}

export function attachmentCategoryLabel(value: AttachmentCategory): string {
  return categoryLabels[value];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(1).replace(".", ",")} MB`;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function maskPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 13);
  if (digits.length > 11) return digits;
  const area = digits.slice(0, 2);
  if (digits.length <= 2) return area ? `(${area}` : "";
  if (digits.length <= 6) return `(${area}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${area}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${area}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function maskCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  const first = digits.slice(0, 3);
  const second = digits.slice(3, 6);
  const third = digits.slice(6, 9);
  const check = digits.slice(9);
  if (digits.length <= 3) return first;
  if (digits.length <= 6) return `${first}.${second}`;
  if (digits.length <= 9) return `${first}.${second}.${third}`;
  return `${first}.${second}.${third}-${check}`;
}

export function cpfIsValid(value: string): boolean {
  if (!/^[0-9]{11}$/.test(value)) return false;
  if (/^(\d)\1{10}$/.test(value)) return false;
  const digits = [...value].map(Number);
  let total = 0;
  for (let index = 0; index < 9; index += 1) total += (10 - index) * (digits[index] ?? 0);
  let digit = (total * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== digits[9]) return false;
  total = 0;
  for (let index = 0; index < 10; index += 1)
    total += (11 - index) * (digits[index] ?? 0);
  digit = (total * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === digits[10];
}

export function todayInClinic(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function ageLabel(birthDate: string, today: string): string {
  if (!isRealDate(birthDate) || !isRealDate(today) || birthDate > today) return "";
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  let years = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) {
    years -= 1;
  }
  if (years >= 1) return years === 1 ? "1 ano" : `${years} anos`;
  let months = (todayYear - birthYear) * 12 + (todayMonth - birthMonth);
  if (todayDay < birthDay) months -= 1;
  if (months <= 0) return "menos de 1 mês";
  return months === 1 ? "1 mês" : `${months} meses`;
}

export function formatClinicDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatClinicTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: CLINIC_TIME_ZONE,
    dateStyle: "short",
  }).format(date);
}

export function phoneLinks(phone: string): { call: string; whatsapp: string } | null {
  const digits = onlyDigits(phone);
  if (!/^[0-9]{10,13}$/.test(digits)) return null;
  const international = digits.length <= 11 ? `55${digits}` : digits;
  return { call: `tel:+${international}`, whatsapp: `https://wa.me/${international}` };
}

export function displayName(fullName: string, preferredName: string | null): string {
  const preferred = preferredName?.trim();
  if (
    !preferred ||
    preferred.toLocaleLowerCase("pt-BR") === fullName.toLocaleLowerCase("pt-BR")
  ) {
    return fullName;
  }
  return `${fullName} (${preferred})`;
}

export function searchText(value: string): string {
  return value
    .trim()
    .slice(0, 80)
    .replace(/[%_\\]/g, "");
}
