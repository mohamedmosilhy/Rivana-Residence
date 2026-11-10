import "server-only";

import { CleanupPublicThrottles } from "@/application/shared/cleanup-public-throttles";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaPublicRateLimitStore } from "@/infrastructure/db/prisma/repositories/public-rate-limit-store";

/** One bounded operator run, including release of its database connection. */
export async function cleanupPublicThrottles() {
  const client = getPrisma();
  const clock = { now: () => new Date() };
  try {
    return await new CleanupPublicThrottles(
      new PrismaPublicRateLimitStore(client, clock),
      clock,
    ).execute();
  } finally {
    await client.$disconnect();
  }
}
