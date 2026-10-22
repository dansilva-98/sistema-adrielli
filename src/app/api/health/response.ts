export type HealthStatus = "ok" | "degraded";

export function healthResponse(status: HealthStatus): Response {
  return Response.json(
    { status },
    {
      status: status === "ok" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
