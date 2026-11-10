// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { CleanupPublicThrottles } from "@/application/shared/cleanup-public-throttles";
import { RateLimiter } from "@/application/shared/rate-limit";
import {
  admitPublicRequest,
  AVAILABILITY_RATE_LIMIT,
} from "@/application/shared/public-rate-limit-policy";
import type { PublicRateLimitStore } from "@/application/shared/public-rate-limit-ports";
import type { ThrottleState } from "@/domain/auth/login-throttle";

const now = new Date("2026-11-10T12:00:00Z");
const rule = { maxRequests: 60, windowMs: 60_000 };
const state = (failures: number): ThrottleState => ({
  failures,
  windowStartedAt: now,
  lockedUntil: null,
});

describe("public admission policy (M6 AC-8)", () => {
  it("allows exactly 60 requests and denies 61 without extending the window", () => {
    let current: ThrottleState | null = null;
    for (let i = 0; i < 60; i += 1) {
      const next = admitPublicRequest(current, rule, now);
      expect(next.outcome).toEqual({ allowed: true });
      current = next.state;
    }
    expect(current?.failures).toBe(60);
    expect(admitPublicRequest(current, rule, new Date(+now + 1_001))).toEqual({
      outcome: { allowed: false, retryAfterSeconds: 59 },
      state: current,
    });
  });

  it.each([59_999, 60_000, 60_001])("handles expiry at %i ms", (offset) => {
    const current = { ...state(60), lockedUntil: new Date(+now + 60_000) };
    const next = admitPublicRequest(current, rule, new Date(+now + offset));
    expect(next.outcome.allowed).toBe(offset >= 60_000);
    expect(next.state.failures).toBe(offset >= 60_000 ? 1 : 60);
    if (offset >= 60_000)
      expect(next.state.windowStartedAt).toEqual(new Date(+now + offset));
  });

  it("retains an existing active lock even after its window ends", () => {
    expect(
      admitPublicRequest(
        { ...state(60), lockedUntil: new Date(+now + 90_500) },
        rule,
        new Date(+now + 60_000),
      ).outcome,
    ).toEqual({ allowed: false, retryAfterSeconds: 31 });
  });
});

describe("RateLimiter (M6 AC-8)", () => {
  function setup() {
    const store: PublicRateLimitStore = {
      consume: vi.fn(async () => ({ allowed: true as const })),
      cleanupExpiredAvailability: vi.fn(async () => 12),
    };
    const keys = {
      namespaced: vi.fn((ns: string, address: string) => `rl:${ns}:${address}`),
    };
    return { store, keys, limiter: new RateLimiter(store, keys) };
  }

  it("delegates atomic admission with a namespaced key and request policy", async () => {
    const { store, keys, limiter } = setup();
    expect(
      await limiter.consume(
        "availability",
        AVAILABILITY_RATE_LIMIT.rule,
        "203.0.113.9",
      ),
    ).toEqual({ allowed: true });
    expect(keys.namespaced).toHaveBeenCalledWith("availability", "203.0.113.9");
    expect(store.consume).toHaveBeenCalledWith(
      "rl:availability:203.0.113.9",
      rule,
    );
  });

  it.each([null, ""])(
    "uses a shared anonymous bucket for %s",
    async (address) => {
      const { store, keys, limiter } = setup();
      await limiter.consume(
        "availability",
        AVAILABILITY_RATE_LIMIT.rule,
        address,
      );
      expect(keys.namespaced).toHaveBeenCalledWith("availability", "anonymous");
      expect(store.consume).toHaveBeenCalledOnce();
    },
  );

  it("propagates a denial and its remaining window", async () => {
    const { store, limiter } = setup();
    vi.mocked(store.consume).mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 19,
    });
    expect(
      await limiter.consume("availability", AVAILABILITY_RATE_LIMIT.rule, null),
    ).toEqual({ allowed: false, retryAfterSeconds: 19 });
  });

  it("fails closed on store failure", async () => {
    const { store, limiter } = setup();
    vi.mocked(store.consume).mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(
      limiter.consume("availability", AVAILABILITY_RATE_LIMIT.rule, null),
    ).rejects.toThrow("database unavailable");
  });

  it("runs bounded cleanup with the injected clock", async () => {
    const { store } = setup();
    expect(
      await new CleanupPublicThrottles(store, { now: () => now }).execute(),
    ).toEqual({ deleted: 12 });
    expect(store.cleanupExpiredAvailability).toHaveBeenCalledExactlyOnceWith(
      now,
    );
  });
});
