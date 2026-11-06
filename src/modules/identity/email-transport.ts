import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type StaffEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MemoryStaffEmail = StaffEmailMessage & { sentAt: number };

const inboxPath = join(tmpdir(), "adrielli-flores-staff-mfa-emails.json");

export function memoryStaffEmailInboxPath(): string {
  return inboxPath;
}

export function readMemoryStaffEmails(): MemoryStaffEmail[] {
  if (!existsSync(inboxPath)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(inboxPath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMemoryStaffEmail);
  } catch {
    return [];
  }
}

export function clearMemoryStaffEmails(): void {
  writeFileSync(inboxPath, "[]", "utf8");
}

export function rememberStaffEmail(message: StaffEmailMessage): void {
  const inbox = readMemoryStaffEmails();
  inbox.push({ ...message, sentAt: Date.now() });
  writeFileSync(inboxPath, JSON.stringify(inbox), "utf8");
}

export function latestMemoryStaffEmail(to: string): MemoryStaffEmail | null {
  const matches = readMemoryStaffEmails().filter((item) => item.to === to);
  return matches.at(-1) ?? null;
}

export function codeFromStaffEmailSubject(subject: string): string | null {
  const match = subject.match(/(\d{6})\s*$/);
  return match?.[1] ?? null;
}

function isMemoryStaffEmail(value: unknown): value is MemoryStaffEmail {
  if (typeof value !== "object" || value === null) return false;
  const item = value as MemoryStaffEmail;
  return (
    typeof item.to === "string" &&
    typeof item.subject === "string" &&
    typeof item.text === "string" &&
    typeof item.html === "string" &&
    typeof item.sentAt === "number"
  );
}

export async function sendStaffEmail(input: {
  message: StaffEmailMessage;
  from: string;
  transport: "memory" | "resend";
  apiKey?: string;
}): Promise<void> {
  if (input.transport === "memory") {
    rememberStaffEmail(input.message);
    return;
  }
  if (!input.apiKey) throw new Error("Falha ao enviar e-mail de MFA");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.message.to],
      subject: input.message.subject,
      text: input.message.text,
      html: input.message.html,
    }),
  });
  if (!response.ok) throw new Error("Falha ao enviar e-mail de MFA");
}
