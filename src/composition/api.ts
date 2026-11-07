import "server-only";

import { CheckHealth } from "@/application/health";
import { RateLimiter } from "@/application/shared/rate-limit";
import { resolveStaffFromHeaders, throttleKeys } from "@/composition/auth";
import { clientAddressFrom, isSameOriginRequest } from "@/composition/http";
import type { ThrottleRule } from "@/domain/auth/login-throttle";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaDatabaseProbe } from "@/infrastructure/db/prisma/database-probe";
import { PrismaLoginThrottleStore } from "@/infrastructure/db/prisma/repositories/login-throttle-store";

// Composition for `/api/v1` Route Handlers and their shared HTTP layer.

const clock = { now: () => new Date() };

export function checkHealth() {
  return new CheckHealth(new PrismaDatabaseProbe()).execute();
}

/** Dependencies of the `/api/v1/_http` wrappers. */
export const httpDependencies = {
  isSameOrigin: isSameOriginRequest,
  resolveStaff: resolveStaffFromHeaders,
  rateLimit: (namespace: string, rule: ThrottleRule, request: Request) =>
    new RateLimiter(
      new PrismaLoginThrottleStore(getPrisma()),
      throttleKeys(),
      clock,
    ).consume(namespace, rule, clientAddressFrom(request.headers)),
};
