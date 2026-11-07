import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/v1/health/route";

// AC-2 through the real Route Handler, wrapper, and composition root.
describe("GET /api/v1/health", () => {
  it("answers 200 with the documented body and API headers", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/v1/health", {
        headers: { "x-request-id": "health-check-1" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("health-check-1");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
