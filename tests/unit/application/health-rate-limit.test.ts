// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckHealth } from "@/application/health";

describe("CheckHealth (AC-2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports ok when the database answers", async () => {
    const health = new CheckHealth({ ping: async () => undefined });
    expect(await health.execute()).toEqual({
      ok: true,
      value: { status: "ok", database: "ok" },
    });
  });

  it("reports TRY_AGAIN without detail when the database fails", async () => {
    const health = new CheckHealth({
      ping: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=x");
      },
    });
    expect(await health.execute()).toEqual({
      ok: false,
      error: {
        code: "TRY_AGAIN",
        message: "The service is temporarily unavailable.",
      },
    });
  });

  it("gives up after the timeout when the database hangs", async () => {
    const health = new CheckHealth({ ping: () => new Promise(() => {}) }, 2000);
    const pending = health.execute();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: "TRY_AGAIN" },
    });
  });
});
