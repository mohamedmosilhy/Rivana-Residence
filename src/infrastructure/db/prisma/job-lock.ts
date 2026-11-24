import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

/** A run may take this long before its guard transaction gives up. */
const JOB_GUARD_TIMEOUT_MS = 10 * 60_000;

/**
 * Runs `work` unless another process holds the same advisory lock key. A
 * transaction level advisory lock marks the run: PostgreSQL releases it when
 * the guard transaction ends, even if the process dies. `work` uses other
 * pooled connections. Returns `null` when the lock was taken.
 */
export async function runWithJobLock<Value>(
  client: PrismaClient,
  key: number,
  work: () => Promise<Value>,
): Promise<Value | null> {
  return client.$transaction(
    async (guard) => {
      const [row] = await guard.$queryRaw<Readonly<{ locked: boolean }>[]>`
        SELECT pg_try_advisory_xact_lock(${key}::bigint) AS locked`;
      return row?.locked ? await work() : null;
    },
    { timeout: JOB_GUARD_TIMEOUT_MS, maxWait: 5_000 },
  );
}
