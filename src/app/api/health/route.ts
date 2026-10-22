import { connection } from "next/server";

import { pingDatabase } from "@/db/client";
import { healthResponse } from "@/app/api/health/response";

export async function GET() {
  await connection();
  const reachable = await pingDatabase();
  return healthResponse(reachable ? "ok" : "degraded");
}
