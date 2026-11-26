import "server-only";

import type {
  AnalyticsSaltStore,
  RecordedSiteEvent,
  SiteEventStore,
  SiteRollupStore,
} from "@/application/analytics/ports";
import {
  WHOLE_SITE,
  type DailyTotal,
  type SiteEventName,
} from "@/domain/analytics";
import { Prisma } from "@/generated/prisma/client";
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

  async recordedSince(
    event: Parameters<SiteEventStore["recordedSince"]>[0],
    since: Date,
  ) {
    const { sessionId, name, branchId, roomId } = event;
    const found = await this.client.siteEvent.findFirst({
      where: {
        sessionId,
        name,
        branchId,
        roomId,
        occurredAt: { gt: since },
      },
      select: { id: true },
    });
    return found !== null;
  }
}

const dayText = (value: Date) => value.toISOString().slice(0, 10);
const dayValue = (day: string) => new Date(`${day}T00:00:00Z`);

/** The marker every totalled day has (`dailyTotals` always writes it). */
const TOTALLED = Prisma.sql`
  EXISTS (
    SELECT 1 FROM "SiteDailyTotal" total
    WHERE total."date" = (event."occurredAt" AT TIME ZONE 'UTC')::date
      AND total."branchId" = ${WHOLE_SITE} AND total."dimension" = 'TOTAL'
  )
`;

export class PrismaSiteRollupStore implements SiteRollupStore {
  constructor(private readonly client: DatabaseClient) {}

  async daysWithoutTotals(today: string) {
    const rows = await this.client.$queryRaw<{ day: Date }[]>`
      SELECT DISTINCT (event."occurredAt" AT TIME ZONE 'UTC')::date AS day
      FROM "SiteEvent" event
      WHERE event."occurredAt" < ${dayValue(today)} AND NOT ${TOTALLED}
      ORDER BY day
    `;
    return rows.map(({ day }) => dayText(day));
  }

  async daysWithEvents(days: readonly string[]) {
    const found: string[] = [];
    for (const day of days) {
      const start = dayValue(day);
      const event = await this.client.siteEvent.findFirst({
        where: {
          occurredAt: {
            gte: start,
            lt: new Date(start.getTime() + 24 * 60 * 60_000),
          },
        },
        select: { id: true },
      });
      if (event) found.push(day);
    }
    return found;
  }

  async eventsBetween(from: Date, to: Date) {
    const rows = await this.client.siteEvent.findMany({
      where: { occurredAt: { gte: from, lt: to } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      sessionId: row.sessionId,
      visitorHash: row.visitorHash,
      // The migration's CHECK restricts the name to the fixed list.
      name: row.name as SiteEventName,
      path: row.path,
      funnelStep: row.funnelStep,
      branchId: row.branchId,
      roomId: row.roomId,
      referrerHost: row.referrerHost,
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      device: row.device,
      outcome: row.outcome,
      stayCheckIn: row.stayCheckIn ? dayText(row.stayCheckIn) : null,
      stayCheckOut: row.stayCheckOut ? dayText(row.stayCheckOut) : null,
    }));
  }

  async replaceTotals(day: string, totals: readonly DailyTotal[]) {
    const date = dayValue(day);
    await withTransaction(this.client, async (tx) => {
      await tx.siteDailyTotal.deleteMany({ where: { date } });
      await tx.siteDailyTotal.createMany({
        data: totals.map((total) => ({ ...total, date })),
      });
    });
  }

  async deleteTotalledBefore(cutoff: Date) {
    return this.client.$executeRaw`
      DELETE FROM "SiteEvent" event
      WHERE event."occurredAt" < ${cutoff} AND ${TOTALLED}
    `;
  }
}
