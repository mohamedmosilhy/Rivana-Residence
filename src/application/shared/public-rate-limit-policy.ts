import type { ThrottleState } from "@/domain/auth/login-throttle";

import type { PublicRateLimitRule } from "./public-rate-limit-ports";
import type { RateLimitOutcome } from "./rate-limit";

export const AVAILABILITY_RATE_LIMIT = {
  name: "availability",
  rule: { maxFailures: 60, windowMs: 60_000, lockMs: 60_000 },
} as const;

export const PUBLIC_THROTTLE_CLEANUP_LIMIT = 1_000;

/** Called with the bucket locked. Denials never extend a window or lock. */
export function admitPublicRequest(
  state: ThrottleState | null,
  rule: PublicRateLimitRule,
  now: Date,
): Readonly<{ outcome: RateLimitOutcome; state: ThrottleState }> {
  const windowEnd = state ? state.windowStartedAt.getTime() + rule.windowMs : 0;
  const retryUntil = Math.max(windowEnd, state?.lockedUntil?.getTime() ?? 0);
  if (
    state &&
    ((windowEnd > now.getTime() && state.failures >= rule.maxRequests) ||
      (state.lockedUntil?.getTime() ?? 0) > now.getTime())
  ) {
    return {
      outcome: {
        allowed: false,
        retryAfterSeconds: Math.ceil((retryUntil - now.getTime()) / 1000),
      },
      state,
    };
  }
  const expired = !state || windowEnd <= now.getTime();
  const windowStartedAt = expired ? now : state.windowStartedAt;
  return {
    outcome: { allowed: true },
    state: {
      failures: expired ? 1 : state.failures + 1,
      windowStartedAt,
      // The table's lock field is set only when the public bucket is full.
      lockedUntil:
        (expired ? 1 : state.failures + 1) >= rule.maxRequests
          ? new Date(windowStartedAt.getTime() + rule.windowMs)
          : null,
    },
  };
}
