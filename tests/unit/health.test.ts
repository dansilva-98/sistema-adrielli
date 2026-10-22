import { describe, expect, it } from "vitest";

import { healthResponse } from "@/app/api/health/response";

describe("health response", () => {
  it("responde só com status, sem detalhe interno", async () => {
    const degraded = healthResponse("degraded");
    const body = await degraded.json();
    expect(degraded.status).toBe(503);
    expect(body).toEqual({ status: "degraded" });
    expect(Object.keys(body)).toEqual(["status"]);

    const ok = healthResponse("ok");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: "ok" });
  });
});
