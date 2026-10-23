import { CONTENT_LIMITS } from "@/db/content-limits";

export function whatsappDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, CONTENT_LIMITS.whatsappNumber);
}

export function maskWhatsapp(value: string): string {
  const digits = whatsappDigits(value);
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length > 4) {
    const area = digits.slice(2, 4);
    const local = digits.slice(4);
    const formatted =
      local.length > 4 ? `${local.slice(0, -4)}-${local.slice(-4)}` : local;
    return `+55 (${area}) ${formatted}`.trim();
  }
  return `+${digits}`;
}

export function whatsAppUrl(number: string | null, message: string): string | null {
  if (!number) return null;
  const text = message.trim();
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number}${query}`;
}
