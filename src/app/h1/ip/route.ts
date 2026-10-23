import { connection } from "next/server";

const HEADER_NAMES = [
  "x-nf-client-connection-ip",
  "x-forwarded-for",
  "x-real-ip",
  "client-ip",
  "x-nf-geo",
] as const;

export async function GET(request: Request) {
  await connection();
  const headers: Record<string, string> = {};
  for (const name of HEADER_NAMES) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  return Response.json({ headers }, { headers: { "cache-control": "no-store" } });
}
