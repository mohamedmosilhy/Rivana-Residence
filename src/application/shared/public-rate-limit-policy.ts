import type { ThrottleState } from "@/domain/auth/login-throttle";

import type { PublicRateLimitRule } from "./public-rate-limit-ports";
import type { RateLimitOutcome } from "./rate-limit";

export const AVAILABILITY_RATE_LIMIT = {
  name: "availability",
  rule: { maxFailures: 60, windowMs: 60_000, lockMs: 60_000 },
} as const;

/** API-P6: every quote request, with or without a coupon code. */
export const QUOTE_RATE_LIMIT = {
  name: "quote",
  rule: { maxFailures: 60, windowMs: 60_000, lockMs: 60_000 },
} as const;

/** API-P6: extra limit for requests that send a code, to slow code guessing. */
export const QUOTE_COUPON_RATE_LIMIT = {
  name: "quote-coupon",
  rule: { maxFailures: 20, windowMs: 600_000, lockMs: 600_000 },
} as const;

/**
 * API-A8: the Admin's WhatsApp test message, 5 per 10 minutes per staff user
 * (owner, 2026-11-17). A staff bucket on the same atomic store, keyed by the
 * staff id instead of a client address, and consumed by the use case only
 * after `authorize`.
 */
export const WHATSAPP_TEST_RATE_LIMIT = {
  name: "whatsapp-test",
  rule: { maxFailures: 5, windowMs: 600_000, lockMs: 600_000 },
} as const;

/** API-P9 and API-P10, Q-74. */
export const VERIFICATION_REQUEST_RATE_LIMIT = {
  name: "verification-request",
  rule: { maxFailures: 10, windowMs: 3_600_000, lockMs: 3_600_000 },
} as const;
export const VERIFICATION_CONFIRM_RATE_LIMIT = {
  name: "verification-confirm",
  rule: { maxFailures: 20, windowMs: 600_000, lockMs: 600_000 },
} as const;

/** API-P7: five booking attempts per client per hour (api-contracts). */
export const BOOKING_CREATE_RATE_LIMIT = {
  name: "booking-create",
  rule: { maxFailures: 5, windowMs: 3_600_000, lockMs: 3_600_000 },
} as const;

/** API-G1, G3 and G4: guest token reads, 60 per client per minute (M8-T11). */
export const GUEST_READ_RATE_LIMIT = {
  name: "guest-read",
  rule: { maxFailures: 60, windowMs: 60_000, lockMs: 60_000 },
} as const;

/** G2 and G4 share ten cancellation request attempts per client per hour. */
export const GUEST_REQUEST_RATE_LIMIT = {
  name: "guest-request",
  rule: { maxFailures: 10, windowMs: 3_600_000, lockMs: 3_600_000 },
} as const;

/** Guest changes share each client bucket across both access paths (Decision 8). */
export const GUEST_CHANGE_PREVIEW_RATE_LIMIT = {
  name: "guest-change-preview",
  rule: { maxFailures: 30, windowMs: 600_000, lockMs: 600_000 },
} as const;
export const GUEST_CHANGE_RATE_LIMIT = {
  name: "guest-change",
  rule: { maxFailures: 10, windowMs: 3_600_000, lockMs: 3_600_000 },
} as const;

/** P11: 120 analytics batches per client per minute. */
export const ANALYTICS_RATE_LIMIT = {
  name: "analytics",
  rule: { maxFailures: 120, windowMs: 60_000, lockMs: 60_000 },
} as const;

/** Every limiter namespace on the shared store; cleanup prunes each one. */
export const PUBLIC_RATE_LIMITS = [
  ANALYTICS_RATE_LIMIT,
  GUEST_READ_RATE_LIMIT,
  GUEST_REQUEST_RATE_LIMIT,
  GUEST_CHANGE_PREVIEW_RATE_LIMIT,
  GUEST_CHANGE_RATE_LIMIT,
  BOOKING_CREATE_RATE_LIMIT,
  AVAILABILITY_RATE_LIMIT,
  QUOTE_RATE_LIMIT,
  QUOTE_COUPON_RATE_LIMIT,
  WHATSAPP_TEST_RATE_LIMIT,
  VERIFICATION_REQUEST_RATE_LIMIT,
  VERIFICATION_CONFIRM_RATE_LIMIT,
] as const;

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
