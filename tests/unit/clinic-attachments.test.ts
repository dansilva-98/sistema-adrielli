import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  issueUploadReceipt,
  readUploadReceipt,
} from "../../src/modules/clinic/attachment-receipt";
import {
  ATTACHMENT_MAX_BYTES,
  detectMime,
  prepareStoredBytes,
  sha256Hex,
} from "../../src/modules/clinic/file-bytes";

const SECRET = "test-secret-with-32-characters-min";

describe("anexos", () => {
  it("reconhece o tipo pelos primeiros bytes e recusa extensão mentida", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    expect(detectMime(png)).toBe("image/png");
    await expect(prepareStoredBytes(png, "application/pdf")).rejects.toMatchObject({
      code: "type",
    });
  });

  it("recusa arquivo acima de 10 MB e calcula o SHA-256", async () => {
    const tooBig = new Uint8Array(ATTACHMENT_MAX_BYTES + 1);
    tooBig.set([0x25, 0x50, 0x44, 0x46], 0);
    await expect(prepareStoredBytes(tooBig, "application/pdf")).rejects.toMatchObject({
      code: "size",
    });
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const stored = await prepareStoredBytes(pdf, "application/pdf");
    expect(sha256Hex(stored)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("remove o EXIF da imagem", async () => {
    const dirty = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "blue" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect((await sharp(dirty).metadata()).orientation).toBe(6);
    const cleaned = await prepareStoredBytes(dirty, "image/jpeg");
    expect(detectMime(cleaned)).toBe("image/jpeg");
    expect((await sharp(cleaned).metadata()).orientation).toBeUndefined();
  });

  it("recusa um recibo expirado ou alterado", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    const token = issueUploadReceipt(
      SECRET,
      {
        patientId: "11111111-1111-4111-8111-111111111111",
        path: "patients/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg",
        mime: "image/jpeg",
        actorId: "22222222-2222-4222-8222-222222222222",
      },
      now,
    );
    expect(readUploadReceipt(SECRET, token, now)?.mime).toBe("image/jpeg");
    expect(readUploadReceipt(SECRET, token, now + 11 * 60 * 1000)).toBeNull();
    expect(readUploadReceipt(SECRET, `${token}x`, now)).toBeNull();
  });
});
