import "server-only";

import type { Clock } from "@/application/ports/providers";
import type {
  PublicRateLimitRule,
  PublicRateLimitStore,
} from "@/application/shared/public-rate-limit-ports";
import {
  admitPublicRequest,
  PUBLIC_RATE_LIMITS,
  PUBLIC_THROTTLE_CLEANUP_LIMIT,
} from "@/application/shared/public-rate-limit-policy";
import type { ThrottleState } from "@/domain/auth/login-throttle";

import { type DatabaseClient, withTransaction } from "../transaction";

export class PrismaPublicRateLimitStore implements PublicRateLimitStore {
  constructor(
    private readonly client: DatabaseClient,
    private readonly clock: Clock,
  ) {}

  consume(key: string, rule: PublicRateLimitRule) {
    return withTransaction(this.client, async (transaction) => {
      // The upsert acquires the row lock even on first admission. Unlike a
      // separate INSERT/SELECT, cleanup cannot delete the row between them.
      const [current] = await transaction.$queryRaw<ThrottleState[]>`
        INSERT INTO "LoginThrottle" ("key", "failures", "windowStartedAt", "updatedAt")
        VALUES (${key}, 0, ${this.clock.now()}, ${this.clock.now()})
        ON CONFLICT ("key") DO UPDATE SET "key" = EXCLUDED."key"
        RETURNING "failures", "windowStartedAt", "lockedUntil"
      `;
      if (!current)
        throw new Error("Public throttle admission returned no bucket.");
      const now = this.clock.now();
      const next = admitPublicRequest(
        current.failures === 0 ? null : current,
        rule,
        now,
      );
      if (next.outcome.allowed) {
        await transaction.loginThrottle.update({
          where: { key },
          data: { ...next.state, updatedAt: now },
        });
      }
      return next.outcome;
    });
  }

  async cleanupExpired(now: Date) {
    let deleted = 0;
    for (const limit of PUBLIC_RATE_LIMITS) {
      deleted += await this.cleanupNamespace(
        `rl:${limit.name}:%`,
        new Date(now.getTime() - limit.rule.windowMs),
        now,
      );
    }
    return deleted;
  }

  private cleanupNamespace(prefix: string, expiredBefore: Date, now: Date) {
    // SELECT locks and rechecks candidates before DELETE. Admissions either
    // keep their locked row, or insert a fresh bucket after deletion commits.
    return this.client.$executeRaw`
      WITH expired AS (
        SELECT "key" FROM "LoginThrottle"
        WHERE "key" LIKE ${prefix}
          AND "windowStartedAt" <= ${expiredBefore}
          AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
        ORDER BY "updatedAt", "key"
        LIMIT ${PUBLIC_THROTTLE_CLEANUP_LIMIT}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "LoginThrottle" AS throttle
      USING expired WHERE throttle."key" = expired."key"
    `;
  }
}
