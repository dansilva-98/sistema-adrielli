import sharp from "sharp";
import { connection } from "next/server";

export async function GET() {
  await connection();
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 12, g: 34, b: 56 } },
  })
    .png()
    .toBuffer();
  const webp = await sharp(png).webp({ quality: 80 }).toBuffer();
  return new Response(new Uint8Array(webp), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "no-store",
    },
  });
}
