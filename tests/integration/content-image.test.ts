import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prepareSiteImage } from "@/modules/content/image";
import { removeSiteObject, uploadSiteObject } from "@/modules/content/storage";

describe("imagem no bucket site-public", () => {
  const config = { supabaseUrl: "", serviceRoleKey: "" };
  let path: string | undefined;

  beforeAll(() => {
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    config.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    config.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!config.supabaseUrl || !config.serviceRoleKey) {
      throw new Error("Recusado: storage local ausente.");
    }
  });

  afterAll(async () => {
    if (path) await removeSiteObject(config, path);
  });

  it("grava WebP sem o marcador EXIF e apaga o arquivo no fim", async () => {
    const jpeg = await sharp({
      create: { width: 12, height: 8, channels: 3, background: { r: 9, g: 8, b: 7 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { ImageDescription: "GPS-MARKER-99" } } })
      .toBuffer();
    const webp = await prepareSiteImage(jpeg);
    path = await uploadSiteObject(config, webp);
    expect(path.endsWith(".webp")).toBe(true);
    const stored = await fetch(
      new URL(`/storage/v1/object/public/site-public/${path}`, config.supabaseUrl),
    );
    expect(stored.ok).toBe(true);
    const bytes = Buffer.from(await stored.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.includes(Buffer.from("GPS-MARKER-99"))).toBe(false);
  });
});
