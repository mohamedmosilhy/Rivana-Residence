export type ThrottleRule = Readonly<{
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}>;

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Per-account limits stop password guessing against one staff member;
// per-client limits stop spraying many accounts from one source.
export const LOGIN_THROTTLE_RULES = {
  account: {
    maxFailures: 5,
    windowMs: FIFTEEN_MINUTES,
    lockMs: FIFTEEN_MINUTES,
  },
  client: {
    maxFailures: 20,
    windowMs: FIFTEEN_MINUTES,
    lockMs: FIFTEEN_MINUTES,
  },
} as const satisfies Record<string, ThrottleRule>;

export type ThrottleState = Readonly<{
  failures: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
}>;

export function retryAfterMs(state: ThrottleState | null, now: Date) {
  if (!state?.lockedUntil) return 0;
  return Math.max(0, state.lockedUntil.getTime() - now.getTime());
}

export function recordFailure(
  state: ThrottleState | null,
  rule: ThrottleRule,
  now: Date,
): ThrottleState {
  const windowExpired =
    !state || now.getTime() - state.windowStartedAt.getTime() >= rule.windowMs;
  const failures = windowExpired ? 1 : state.failures + 1;
  const windowStartedAt = windowExpired ? now : state.windowStartedAt;
  const lockedUntil =
    failures >= rule.maxFailures
      ? new Date(now.getTime() + rule.lockMs)
      : windowExpired
        ? null
        : state.lockedUntil;

  return { failures, windowStartedAt, lockedUntil };
}
