// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoginThrottleStore } from "@/application/auth/ports";
import { CheckHealth } from "@/application/health";
import { RateLimiter } from "@/application/shared/rate-limit";
import type { ThrottleState } from "@/domain/auth/login-throttle";

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

describe("RateLimiter", () => {
  const rule = { maxFailures: 2, windowMs: 60_000, lockMs: 120_000 };
  const now = new Date("2026-11-06T10:00:00Z");

  function setup(state: ThrottleState | null = null) {
    const store: LoginThrottleStore = {
      get: vi.fn(async () => state),
      recordFailure: vi.fn(async () => ({
        failures: 1,
        windowStartedAt: now,
        lockedUntil: null,
      })),
      clear: vi.fn(async () => undefined),
    };
    const keys = {
      namespaced: vi.fn((ns: string, a: string) => `rl:${ns}:#${a.length}`),
    };
    return {
      store,
      keys,
      limiter: new RateLimiter(store, keys, { now: () => now }),
    };
  }

  it("counts an allowed request under a namespaced hashed key", async () => {
    const { limiter, store, keys } = setup();
    expect(await limiter.consume("quote", rule, "203.0.113.9")).toEqual({
      allowed: true,
    });
    expect(keys.namespaced).toHaveBeenCalledWith("quote", "203.0.113.9");
    expect(store.recordFailure).toHaveBeenCalledWith("rl:quote:#11", rule, now);
  });

  it("refuses a locked client with the seconds left, without counting", async () => {
    const { limiter, store } = setup({
      failures: 2,
      windowStartedAt: now,
      lockedUntil: new Date(now.getTime() + 90_500),
    });
    expect(await limiter.consume("quote", rule, "203.0.113.9")).toEqual({
      allowed: false,
      retryAfterSeconds: 91,
    });
    expect(store.recordFailure).not.toHaveBeenCalled();
  });

  it("applies no per-client limit when the address is unknown", async () => {
    const { limiter, store } = setup();
    expect(await limiter.consume("quote", rule, null)).toEqual({
      allowed: true,
    });
    expect(store.get).not.toHaveBeenCalled();
  });
});
