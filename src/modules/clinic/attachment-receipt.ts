import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { extensionFor, type StoredMime } from "./file-bytes";

const RECEIPT_TTL_MS = 10 * 60 * 1000;

export type UploadReceipt = {
  patientId: string;
  path: string;
  mime: StoredMime;
  actorId: string;
  expiresAt: number;
};

export function newAttachmentPath(patientId: string, mime: StoredMime): string {
  return `patients/${patientId}/${randomUUID()}.${extensionFor(mime)}`;
}

function receiptKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("clinic-attachment-receipt").digest();
}

export function signUploadReceipt(secret: string, receipt: UploadReceipt): string {
  const body = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  const mac = createHmac("sha256", receiptKey(secret)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function issueUploadReceipt(
  secret: string,
  input: { patientId: string; path: string; mime: StoredMime; actorId: string },
  now: number,
): string {
  return signUploadReceipt(secret, { ...input, expiresAt: now + RECEIPT_TTL_MS });
}

export function readUploadReceipt(
  secret: string,
  token: string,
  now: number,
): UploadReceipt | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const body = token.slice(0, separator);
  const mac = token.slice(separator + 1);
  const expected = createHmac("sha256", receiptKey(secret))
    .update(body)
    .digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  let parsed: UploadReceipt;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadReceipt;
  } catch {
    return null;
  }
  if (
    typeof parsed.patientId !== "string" ||
    typeof parsed.path !== "string" ||
    typeof parsed.mime !== "string" ||
    typeof parsed.actorId !== "string" ||
    typeof parsed.expiresAt !== "number"
  ) {
    return null;
  }
  if (parsed.expiresAt < now) return null;
  if (!parsed.path.startsWith(`patients/${parsed.patientId}/`)) return null;
  return parsed;
}
