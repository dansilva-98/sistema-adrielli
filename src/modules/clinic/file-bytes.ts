import { createHash } from "node:crypto";

import sharp from "sharp";

export const ATTACHMENT_MAX_BYTES = 10_485_760;

export const STORED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type StoredMime = (typeof STORED_MIMES)[number];

const EXTENSIONS: Record<StoredMime, "pdf" | "jpg" | "png" | "webp"> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class AttachmentFileError extends Error {
  readonly code: "type" | "size";

  constructor(code: AttachmentFileError["code"]) {
    super(code);
    this.name = "AttachmentFileError";
    this.code = code;
  }
}

export function extensionFor(mime: StoredMime): "pdf" | "jpg" | "png" | "webp" {
  return EXTENSIONS[mime];
}

export function isStoredMime(value: string): value is StoredMime {
  return (STORED_MIMES as readonly string[]).includes(value);
}

export function detectMime(bytes: Uint8Array): StoredMime | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }
  return null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function prepareStoredBytes(
  bytes: Uint8Array,
  expected: StoredMime,
): Promise<Uint8Array> {
  if (bytes.byteLength < 1 || bytes.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new AttachmentFileError("size");
  }
  if (detectMime(bytes) !== expected) throw new AttachmentFileError("type");
  if (expected === "application/pdf") return bytes;

  let cleaned: Buffer;
  try {
    const image = sharp(bytes, { failOn: "error" }).rotate();
    cleaned =
      expected === "image/jpeg"
        ? await image.jpeg({ quality: 90 }).toBuffer()
        : expected === "image/png"
          ? await image.png().toBuffer()
          : await image.webp({ quality: 90 }).toBuffer();
  } catch {
    throw new AttachmentFileError("type");
  }
  const stored = new Uint8Array(cleaned);
  if (stored.byteLength < 1 || stored.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new AttachmentFileError("size");
  }
  if (detectMime(stored) !== expected) throw new AttachmentFileError("type");
  return stored;
}
