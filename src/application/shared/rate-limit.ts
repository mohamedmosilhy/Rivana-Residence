import type { ThrottleRule } from "@/domain/auth/login-throttle";

import type { PublicRateLimitStore } from "./public-rate-limit-ports";

export interface RateLimitKeys {
  /** A keyed hash of the client address within a namespace. */
  namespaced(namespace: string, address: string): string;
}

export type RateLimitOutcome =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; retryAfterSeconds: number }>;

/** Public fixed window admission. Staff sign-in keeps its separate policy. */
export class RateLimiter {
  constructor(
    private readonly store: PublicRateLimitStore,
    private readonly keys: RateLimitKeys,
  ) {}

  consume(
    namespace: string,
    rule: ThrottleRule,
    clientAddress: string | null,
  ): Promise<RateLimitOutcome> {
    // This reserved value cannot collide with a client IP. All requests
    // without a trusted address share one bucket, rather than bypassing it.
    const key = this.keys.namespaced(namespace, clientAddress || "anonymous");
    // Keep the HTTP wrapper's existing rule shape. Public admission uses
    // maxFailures as the request limit; lockMs belongs to sign-in only.
    return this.store.consume(key, {
      maxRequests: rule.maxFailures,
      windowMs: rule.windowMs,
    });
  }
}
