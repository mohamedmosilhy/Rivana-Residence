import type { LoginThrottleStore } from "@/application/auth/ports";
import type { Clock } from "@/application/ports/providers";
import { retryAfterMs, type ThrottleRule } from "@/domain/auth/login-throttle";

export interface RateLimitKeys {
  /** A keyed hash of the client address within a namespace. */
  namespaced(namespace: string, address: string): string;
}

export type RateLimitOutcome =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; retryAfterSeconds: number }>;

/**
 * Per-client request limit for public endpoints, on the atomic counter store
 * the sign-in throttle uses (ADR 022: no in-process state). Each request
 * counts once; reaching `maxFailures` within `windowMs` locks the client key
 * for `lockMs`. Without a known client address there is no per-client limit,
 * the same as sign-in.
 *
 * Approximate by design: the lock check and the count are two calls, so a
 * concurrent burst can pass a few requests over `maxFailures` before the lock
 * lands. Expired counter rows are not pruned yet (nor are sign-in ones); add
 * a cleanup job before the first public route uses this (M8).
 */
export class RateLimiter {
  constructor(
    private readonly store: LoginThrottleStore,
    private readonly keys: RateLimitKeys,
    private readonly clock: Clock,
  ) {}

  async consume(
    namespace: string,
    rule: ThrottleRule,
    clientAddress: string | null,
  ): Promise<RateLimitOutcome> {
    if (!clientAddress) return { allowed: true };
    const key = this.keys.namespaced(namespace, clientAddress);
    const now = this.clock.now();
    const locked = retryAfterMs(await this.store.get(key), now);
    if (locked > 0) {
      return { allowed: false, retryAfterSeconds: Math.ceil(locked / 1000) };
    }
    await this.store.recordFailure(key, rule, now);
    return { allowed: true };
  }
}
