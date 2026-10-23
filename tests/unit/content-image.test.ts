import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { SITE_IMAGE_MAX_BYTES } from "@/db/content-limits";
import { prepareSiteImage, SiteImageError } from "@/modules/content/image";

describe("imagem do site", () => {
  it("recusa o que não é imagem e o que passa de 4 MB", async () => {
    await expect(
      prepareSiteImage(new TextEncoder().encode("nao-e-imagem.jpg")),
    ).rejects.toBeInstanceOf(SiteImageError);
    const tooBig = new Uint8Array(SITE_IMAGE_MAX_BYTES + 1);
    tooBig[0] = 0xff;
    tooBig[1] = 0xd8;
    tooBig[2] = 0xff;
    await expect(prepareSiteImage(tooBig)).rejects.toMatchObject({ code: "size" });
  });

  it("regrava em WebP e descarta o EXIF", async () => {
    const jpeg = await sharp({
      create: { width: 16, height: 8, channels: 3, background: { r: 20, g: 40, b: 60 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { ImageDescription: "GPS-MARKER-99" } } })
      .toBuffer();
    expect(jpeg.includes(Buffer.from("GPS-MARKER-99"))).toBe(true);
    const webp = await prepareSiteImage(jpeg);
    expect(webp.subarray(0, 4).toString()).toBe("RIFF");
    expect(webp.subarray(8, 12).toString()).toBe("WEBP");
    expect(webp.includes(Buffer.from("GPS-MARKER-99"))).toBe(false);
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBeLessThanOrEqual(2000);
  });
});
