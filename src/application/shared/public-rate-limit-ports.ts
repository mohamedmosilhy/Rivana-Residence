import type { RateLimitOutcome } from "./rate-limit";

export type PublicRateLimitRule = Readonly<{
  maxRequests: number;
  windowMs: number;
}>;

export interface PublicRateLimitStore {
  /** Atomically checks and consumes a slot, using time sampled under the lock. */
  consume(key: string, rule: PublicRateLimitRule): Promise<RateLimitOutcome>;
  /**
   * At most 1,000 expired rows per public limiter namespace; preserves active
   * windows and locks. Returns the total deleted.
   */
  cleanupExpired(now: Date): Promise<number>;
}
