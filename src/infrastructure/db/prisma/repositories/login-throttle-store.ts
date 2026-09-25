import "server-only";

import type { LoginThrottleStore } from "@/application/auth/ports";
import { recordFailure, type ThrottleRule } from "@/domain/auth/login-throttle";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";

const selection = {
  failures: true,
  windowStartedAt: true,
  lockedUntil: true,
} as const;

export class PrismaLoginThrottleStore implements LoginThrottleStore {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  get(key: string) {
    return this.client.loginThrottle.findUnique({
      where: { key },
      select: selection,
    });
  }

  recordFailure(key: string, rule: ThrottleRule, now: Date) {
    return withTransaction(this.client, async (transaction) => {
      // Create the row if needed, then lock it so concurrent failures for the
      // same key are applied one after another.
      await transaction.$executeRaw`
        INSERT INTO "LoginThrottle" ("key", "failures", "windowStartedAt", "updatedAt")
        VALUES (${key}, 0, ${now}, ${now})
        ON CONFLICT ("key") DO NOTHING
      `;
      const [current] = await transaction.$queryRaw<
        { failures: number; windowStartedAt: Date; lockedUntil: Date | null }[]
      >`
        SELECT "failures", "windowStartedAt", "lockedUntil"
        FROM "LoginThrottle" WHERE "key" = ${key} FOR UPDATE
      `;
      const next = recordFailure(
        current && current.failures > 0 ? current : null,
        rule,
        now,
      );
      return transaction.loginThrottle.update({
        where: { key },
        data: next,
        select: selection,
      });
    });
  }

  async clear(key: string) {
    await this.client.loginThrottle.deleteMany({ where: { key } });
  }
}
