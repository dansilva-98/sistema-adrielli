import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const EMAIL_MFA_CODE_LENGTH = 6;
export const EMAIL_MFA_TTL_MS = 10 * 60 * 1000;
export const EMAIL_MFA_MAX_ATTEMPTS = 5;
export const EMAIL_MFA_RESEND_GAP_MS = 60 * 1000;
export const EMAIL_MFA_MAX_SENDS_PER_HOUR = 5;
export const EMAIL_MFA_MAX_SENDS_PER_IP_HOUR = 20;
export const EMAIL_MFA_CLEANUP_MS = 24 * 60 * 60 * 1000;
export const EMAIL_MFA_INVALID_MESSAGE = "Código inválido ou vencido.";
export const EMAIL_MFA_RATE_LIMIT_MESSAGE =
  "Muitos pedidos de código. Tente de novo em alguns minutos.";
export const EMAIL_MFA_SEND_FAILURE_MESSAGE =
  "Não foi possível enviar o código agora. Tente de novo ou use o aplicativo.";
export const EMAIL_MFA_DEFAULT_FROM =
  "Adrielli Flores <nao-responda@adrielliflores.com.br>";

export function generateEmailMfaCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(EMAIL_MFA_CODE_LENGTH, "0");
}

export function emailMfaHmac(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

export function emailMfaHmacsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function parseEmailMfaCode(value: string): string | null {
  const code = value.replace(/\s/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

export function maskStaffEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const first = local[0] ?? "*";
  return `${first}***@${domain}`;
}

export function emailMfaSendAllowed(input: {
  lastSentAt: number | null;
  sendsLastHour: number;
  ipSendsLastHour: number;
  now: number;
}): "ok" | "gap" | "limited" {
  if (
    input.lastSentAt !== null &&
    input.now - input.lastSentAt < EMAIL_MFA_RESEND_GAP_MS
  ) {
    return "gap";
  }
  if (input.sendsLastHour >= EMAIL_MFA_MAX_SENDS_PER_HOUR) return "limited";
  if (input.ipSendsLastHour >= EMAIL_MFA_MAX_SENDS_PER_IP_HOUR) return "limited";
  return "ok";
}

export function emailMfaSubject(code: string): string {
  return `Seu código de acesso: ${code}`;
}

export function emailMfaText(code: string): string {
  return `${code}\n\nVale por 10 minutos.\nSe não foi você, ignore este e-mail e troque sua senha.`;
}

export function emailMfaHtml(code: string): string {
  return `<p>${code}</p><p>Vale por 10 minutos.</p><p>Se não foi você, ignore este e-mail e troque sua senha.</p>`;
}

export function memoryTransportEnabled(input: {
  APP_ENV: string;
  MFA_EMAIL_TRANSPORT?: string;
}): boolean {
  return input.MFA_EMAIL_TRANSPORT === "memory" && input.APP_ENV !== "production";
}

export function memoryTransportForbidden(input: {
  APP_ENV?: string;
  MFA_EMAIL_TRANSPORT?: string;
}): boolean {
  return input.MFA_EMAIL_TRANSPORT === "memory" && input.APP_ENV === "production";
}

export function staffEmailAvailable(input: {
  APP_ENV: string;
  MFA_EMAIL_TRANSPORT?: string;
  RESEND_API_KEY?: string;
}): boolean {
  return memoryTransportEnabled(input) || Boolean(input.RESEND_API_KEY);
}
