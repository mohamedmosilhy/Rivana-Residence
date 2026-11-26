import "server-only";

import { randomBytes } from "node:crypto";

import { RollUpSiteEvents, RotateAnalyticsSalt } from "@/application/analytics";
import type { Clock } from "@/application/shared/providers";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { runWithJobLock } from "@/infrastructure/db/prisma/job-lock";
import {
  PrismaAnalyticsSaltStore,
  PrismaSiteRollupStore,
} from "@/infrastructure/db/prisma/repositories/analytics/site-analytics-store";

/** The advisory lock that stops a slow run being overlapped by the next one. */
export const ANALYTICS_ROLLUP_LOCK_KEY = 724_003;

/**
 * One rollup unless another is running. It runs whether or not collection is
 * switched on, so retention never stops.
 */
export async function runSiteEventRollupOn(
  client: ReturnType<typeof getPrisma>,
  clock: Clock = { now: () => new Date() },
) {
  const summary = await runWithJobLock(client, ANALYTICS_ROLLUP_LOCK_KEY, () =>
    new RollUpSiteEvents({
      clock,
      store: new PrismaSiteRollupStore(client),
      salt: new RotateAnalyticsSalt(new PrismaAnalyticsSaltStore(client), () =>
        randomBytes(32),
      ),
    }).execute(),
  );
  return summary ?? ({ skipped: "ALREADY_RUNNING" } as const);
}

/** `npm run analytics -- rollup`, including release of its connection. */
export async function runSiteEventRollup() {
  const client = getPrisma();
  try {
    return await runSiteEventRollupOn(client);
  } finally {
    await client.$disconnect();
  }
}
