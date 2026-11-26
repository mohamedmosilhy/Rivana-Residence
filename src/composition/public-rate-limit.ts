import "server-only";

import { RateLimiter } from "@/application/shared/rate-limit";
import { throttleKeys } from "@/composition/auth";
import { clientAddressFrom } from "@/composition/http";
import type { ThrottleRule } from "@/domain/auth/login-throttle";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaPublicRateLimitStore } from "@/infrastructure/db/prisma/repositories/public-rate-limit-store";

const clock = { now: () => new Date() };

export function consumePublicRateLimit(
  namespace: string,
  rule: ThrottleRule,
  headers: Headers,
) {
  return new RateLimiter(
    new PrismaPublicRateLimitStore(getPrisma(), clock),
    throttleKeys(),
  ).consume(namespace, rule, clientAddressFrom(headers));
}
