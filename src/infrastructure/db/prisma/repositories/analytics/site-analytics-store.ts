import "server-only";

import type {
  AnalyticsSaltStore,
  RecordedSiteEvent,
  SiteEventStore,
} from "@/application/analytics/ports";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";

// Transaction lock used only when a requested day's salt does not exist.
const SALT_ROTATION_LOCK = 2_029_001;

export class PrismaAnalyticsSaltStore implements AnalyticsSaltStore {
  constructor(private readonly client: DatabaseClient) {}

  async current(day: Date, makeSalt: () => Uint8Array) {
    const current = await this.client.analyticsSalt.findUnique({
      where: { day },
    });
    if (current) return current.salt;

    return withTransaction(this.client, async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${SALT_ROTATION_LOCK}::bigint)`;
      const latest = await tx.analyticsSalt.findFirst({
        orderBy: { day: "desc" },
      });
      // A request that started before midnight can finish after today's
      // rotation. It cannot recreate a deleted secret for yesterday.
      if (latest && +latest.day > +day) return null;
      if (latest && +latest.day === +day) return latest.salt;

      await tx.$executeRaw`
        INSERT INTO "AnalyticsSalt" ("day", "salt") VALUES (${day}::date, ${makeSalt()})
        ON CONFLICT ("day") DO NOTHING
      `;
      const created = await tx.analyticsSalt.findUniqueOrThrow({
        where: { day },
      });
      await tx.analyticsSalt.deleteMany({ where: { day: { lt: day } } });
      return created.salt;
    });
  }
}

export class PrismaSiteEventStore implements SiteEventStore {
  constructor(private readonly client: DatabaseClient) {}

  async branchIdFor(slug: string) {
    const branch = await this.client.branch.findFirst({
      where: { slug, status: "ACTIVE" },
      select: { id: true },
    });
    return branch?.id ?? null;
  }

  async roomIdFor(branchId: string, slug: string) {
    const room = await this.client.room.findFirst({
      where: {
        slug,
        branchId,
        status: "PUBLISHED",
        branch: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    return room?.id ?? null;
  }

  async record(events: readonly RecordedSiteEvent[]) {
    await this.client.siteEvent.createMany({ data: [...events] });
  }
}
