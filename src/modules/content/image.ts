import sharp from "sharp";

import { SITE_IMAGE_MAX_BYTES, SITE_IMAGE_MAX_WIDTH } from "@/db/content-limits";

export class SiteImageError extends Error {
  readonly code: "type" | "size";

  constructor(code: SiteImageError["code"]) {
    super(code);
    this.name = "SiteImageError";
    this.code = code;
  }
}

export async function prepareSiteImage(bytes: Uint8Array): Promise<Buffer> {
  if (bytes.byteLength > SITE_IMAGE_MAX_BYTES) throw new SiteImageError("size");
  if (!hasImageSignature(bytes)) throw new SiteImageError("type");
  try {
    return await sharp(bytes, { failOn: "error" })
      .rotate()
      .resize({ width: SITE_IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new SiteImageError("type");
  }
}

function hasImageSignature(bytes: Uint8Array): boolean {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    return riff === "RIFF" && webp === "WEBP";
  }
  return false;
}
