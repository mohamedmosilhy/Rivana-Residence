import "server-only";

import type {
  BaseRateRecord,
  BaseRateWrite,
  BaseRateWriteOutcome,
  RatePeriodChange,
  RatePeriodCreate,
  RatePeriodRecord,
  RateBatchReader,
  RateRepository,
  RateReadModel,
} from "@/application/pricing";
import type { BranchScope } from "@/application/auth/authorize-branch";
import { failure, success, type Result } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { StayRange } from "@/domain/shared/stay-range";
import { Prisma } from "@/generated/prisma/client";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const periodSelect = {
  id: true,
  roomTypeId: true,
  startDate: true,
  endDate: true,
  amountMinor: true,
  currency: true,
  active: true,
  label: true,
  createdAt: true,
  updatedAt: true,
  roomType: { select: { branchId: true } },
} as const;

type PeriodRow = Prisma.RatePeriodGetPayload<{ select: typeof periodSelect }>;
type BaseRow = Readonly<{
  roomTypeId: string;
  amountMinor: number;
  currency: string;
  updatedAt: Date;
}>;

const OVERLAP = "This listing already has an active rate on those dates.";
const BUSY = "Rates are busy. Please try the request again shortly.";

const toDate = (date: LocalDate) => new Date(`${date.value}T00:00:00.000Z`);
const toLocalDate = (date: Date) =>
  LocalDate.parse(date.toISOString().slice(0, 10));

function amount(amountMinor: number, currency: string) {
  return Money.create({ amountMinor, currency });
}

function baseRecord(row: BaseRow): BaseRateRecord {
  return {
    roomTypeId: row.roomTypeId,
    amount: amount(row.amountMinor, row.currency),
    updatedAt: row.updatedAt,
  };
}

function periodRecord(row: PeriodRow): RatePeriodRecord {
  return {
    id: row.id,
    roomTypeId: row.roomTypeId,
    branchId: row.roomType.branchId,
    range: StayRange.create(
      toLocalDate(row.startDate),
      toLocalDate(row.endDate),
    ),
    amount: amount(row.amountMinor, row.currency),
    active: row.active,
    label: row.label,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function scopeSql(visible: BranchScope) {
  return visible === "ALL"
    ? Prisma.empty
    : Prisma.sql`AND r."branchId" IN (${Prisma.join([...visible])})`;
}

function visibleWhere(visible: BranchScope) {
  return visible === "ALL" ? {} : { branchId: { in: [...visible] } };
}

function translatePeriod(error: unknown): Result<never> {
  const code = postgresErrorCode(error);
  if (code === "55P03") return failure("TRY_AGAIN", BUSY);
  // A competing GiST exclusion check can report either exclusion or deadlock.
  // This catch is deliberately limited to one RatePeriod mutation.
  if (code === "23P01" || code === "40P01") {
    return failure("CONFLICT", OVERLAP, {
      startDate: [OVERLAP],
      endDate: [OVERLAP],
    });
  }
  throw error;
}

export class PrismaRateRepository implements RateRepository, RateBatchReader {
  constructor(private readonly client: DatabaseClient) {}

  async findRoomTypeVisible(roomTypeId: string, visible: BranchScope) {
    if (visible !== "ALL" && visible.length === 0) return null;
    return this.client.room.findFirst({
      where: { id: roomTypeId, ...visibleWhere(visible) },
      select: { id: true, branchId: true },
    });
  }

  async read(roomTypeId: string, window: StayRange): Promise<RateReadModel> {
    // The base rate and periods may come from different pooled connections, so a
    // staff calendar can briefly mix two snapshots. Harmless for a staff read.
    const [base, periods] = await Promise.all([
      this.client.roomBaseRate.findUnique({
        where: { roomTypeId },
        select: {
          roomTypeId: true,
          amountMinor: true,
          currency: true,
          updatedAt: true,
        },
      }),
      this.client.ratePeriod.findMany({
        where: {
          roomTypeId,
          startDate: { lt: toDate(window.checkOut) },
          endDate: { gt: toDate(window.checkIn) },
        },
        select: periodSelect,
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
      }),
    ]);
    return {
      baseRate: base ? baseRecord(base) : null,
      periods: periods.map(periodRecord),
    };
  }

  async readMany(
    roomTypeIds: readonly string[],
    window: StayRange,
  ): Promise<ReadonlyMap<string, RateReadModel>> {
    const ids = [...new Set(roomTypeIds)];
    const models = new Map<string, RateReadModel>(
      ids.map((id) => [id, { baseRate: null, periods: [] }]),
    );
    if (ids.length === 0) return models;
    // Two queries for every listing, not one pair per listing. Availability is a
    // current observation, so the pair need not share a snapshot.
    const [bases, periods] = await Promise.all([
      this.client.roomBaseRate.findMany({
        where: { roomTypeId: { in: ids } },
        select: {
          roomTypeId: true,
          amountMinor: true,
          currency: true,
          updatedAt: true,
        },
      }),
      this.client.ratePeriod.findMany({
        where: {
          roomTypeId: { in: ids },
          active: true,
          startDate: { lt: toDate(window.checkOut) },
          endDate: { gt: toDate(window.checkIn) },
        },
        select: periodSelect,
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
      }),
    ]);
    const grouped = new Map<string, RatePeriodRecord[]>();
    for (const row of periods) {
      const list = grouped.get(row.roomTypeId) ?? [];
      list.push(periodRecord(row));
      grouped.set(row.roomTypeId, list);
    }
    for (const base of bases) {
      models.set(base.roomTypeId, {
        baseRate: baseRecord(base),
        periods: grouped.get(base.roomTypeId) ?? [],
      });
    }
    for (const [id, list] of grouped) {
      const model = models.get(id);
      if (model) models.set(id, { ...model, periods: list });
    }
    return models;
  }

  async findPeriodVisible(id: string, visible: BranchScope) {
    if (visible !== "ALL" && visible.length === 0) return null;
    const row = await this.client.ratePeriod.findFirst({
      where: { id, roomType: visibleWhere(visible) },
      select: periodSelect,
    });
    return row ? periodRecord(row) : null;
  }

  async lockPeriodVisible(
    id: string,
    visible: BranchScope,
  ): Promise<Result<RatePeriodRecord | null>> {
    if (visible !== "ALL" && visible.length === 0) return success(null);
    const scope = scopeSql(visible);
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const locked = await this.client.$queryRaw<
        Readonly<{ id: string }>[]
      >(Prisma.sql`
          SELECT rp.id
          FROM "RatePeriod" rp
          JOIN "Room" r ON r.id = rp."roomTypeId"
          WHERE rp.id = ${id} ${scope}
          FOR UPDATE OF rp
        `);
      if (locked.length === 0) return success(null);
    } catch (error) {
      if (postgresErrorCode(error) === "55P03") {
        return failure("TRY_AGAIN", BUSY);
      }
      throw error;
    }
    const row = await this.client.ratePeriod.findUnique({
      where: { id },
      select: periodSelect,
    });
    return success(row ? periodRecord(row) : null);
  }

  async setBaseRate(
    input: BaseRateWrite,
    visible: BranchScope,
  ): Promise<Result<BaseRateWriteOutcome>> {
    if (visible !== "ALL" && visible.length === 0) {
      return failure("NOT_FOUND", "This listing was not found.");
    }
    const scope = scopeSql(visible);
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const inserted = await this.client.$queryRaw<
        Readonly<{ roomTypeId: string }>[]
      >(Prisma.sql`
        INSERT INTO "RoomBaseRate"
          ("roomTypeId", "amountMinor", currency, "updatedAt", "updatedById")
        SELECT r.id, ${input.amount.amountMinor}, ${input.amount.currency},
          ${input.at}, ${input.updatedById}
        FROM "Room" r
        WHERE r.id = ${input.roomTypeId} ${scope}
        ON CONFLICT ("roomTypeId") DO NOTHING
        RETURNING "roomTypeId"
      `);
      const rows = await this.client.$queryRaw<BaseRow[]>(Prisma.sql`
        SELECT br."roomTypeId", br."amountMinor", br.currency, br."updatedAt"
        FROM "RoomBaseRate" br
        JOIN "Room" r ON r.id = br."roomTypeId"
        WHERE br."roomTypeId" = ${input.roomTypeId} ${scope}
        FOR UPDATE OF br
      `);
      const current = rows[0];
      if (!current) return failure("NOT_FOUND", "This listing was not found.");
      const before = inserted.length > 0 ? null : baseRecord(current);
      if (
        inserted.length > 0 ||
        current.amountMinor === input.amount.amountMinor
      ) {
        const after = baseRecord(current);
        return success({ before, after, changed: inserted.length > 0 });
      }
      const updated = await this.client.roomBaseRate.update({
        where: { roomTypeId: input.roomTypeId },
        data: {
          amountMinor: input.amount.amountMinor,
          currency: input.amount.currency,
          updatedAt: input.at,
          updatedById: input.updatedById,
        },
        select: {
          roomTypeId: true,
          amountMinor: true,
          currency: true,
          updatedAt: true,
        },
      });
      return success({ before, after: baseRecord(updated), changed: true });
    } catch (error) {
      if (postgresErrorCode(error) === "55P03") {
        return failure("TRY_AGAIN", BUSY);
      }
      throw error;
    }
  }

  async createPeriod(input: RatePeriodCreate) {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const row = await this.client.ratePeriod.create({
        data: {
          id: input.id,
          roomTypeId: input.roomTypeId,
          startDate: toDate(input.range.checkIn),
          endDate: toDate(input.range.checkOut),
          amountMinor: input.amount.amountMinor,
          currency: input.amount.currency,
          active: true,
          label: input.label,
          createdAt: input.at,
          updatedAt: input.at,
          updatedById: input.updatedById,
        },
        select: periodSelect,
      });
      return success(periodRecord(row));
    } catch (error) {
      return translatePeriod(error);
    }
  }

  async updatePeriod(id: string, change: RatePeriodChange) {
    try {
      const row = await this.client.ratePeriod.update({
        where: { id },
        data: {
          ...(change.range !== undefined
            ? {
                startDate: toDate(change.range.checkIn),
                endDate: toDate(change.range.checkOut),
              }
            : {}),
          ...(change.amount !== undefined
            ? {
                amountMinor: change.amount.amountMinor,
                currency: change.amount.currency,
              }
            : {}),
          ...(change.label !== undefined ? { label: change.label } : {}),
          ...(change.active !== undefined ? { active: change.active } : {}),
          updatedAt: change.at,
          updatedById: change.updatedById,
        },
        select: periodSelect,
      });
      return success(periodRecord(row));
    } catch (error) {
      return translatePeriod(error);
    }
  }
}
