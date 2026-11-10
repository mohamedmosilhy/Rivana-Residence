import "server-only";

import type {
  BlockChange,
  BlockCreate,
  BlockRecord,
  BlockRepository,
  BranchVisibility,
} from "@/application/inventory";
import { failure, success, type Result } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import { Prisma } from "@/generated/prisma/client";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const select = {
  id: true,
  branchId: true,
  physicalRoomId: true,
  startDate: true,
  endDate: true,
  reason: true,
  note: true,
  cancelledAt: true,
  createdAt: true,
  physicalRoom: { select: { roomTypeId: true } },
} as const;

type Row = Prisma.InventoryBlockGetPayload<{ select: typeof select }>;

const OVERLAP = "This unit already has a block on those dates.";

/** Dates are `DATE` columns; the Prisma boundary maps them at UTC midnight. */
const toDate = (date: LocalDate) => new Date(`${date.value}T00:00:00.000Z`);
const toLocalDate = (date: Date) =>
  LocalDate.parse(date.toISOString().slice(0, 10));

function record(row: Row): BlockRecord {
  return {
    id: row.id,
    branchId: row.branchId,
    physicalRoomId: row.physicalRoomId,
    roomTypeId: row.physicalRoom.roomTypeId,
    range: StayRange.create(
      toLocalDate(row.startDate),
      toLocalDate(row.endDate),
    ),
    reason: row.reason,
    note: row.note,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
  };
}

function visibleWhere(visible: BranchVisibility) {
  return visible === "ALL" ? {} : { branchId: { in: [...visible] } };
}

/** The exclusion constraint refuses overlapping active blocks on one unit. */
function translate(error: unknown): Result<never> {
  if (postgresErrorCode(error) === "55P03") {
    return failure(
      "TRY_AGAIN",
      "Inventory is busy. Please try the request again shortly.",
    );
  }
  if (postgresErrorCode(error) === "23P01") {
    // Create names the dates it sent; an end date change names endDate only,
    // which the use case narrows.
    return failure("CONFLICT", OVERLAP, {
      startDate: [OVERLAP],
      endDate: [OVERLAP],
    });
  }
  throw error;
}

export class PrismaBlockRepository implements BlockRepository {
  constructor(private readonly client: DatabaseClient) {}

  async listOverlapping(branchId: string, window: StayRange) {
    const rows = await this.client.inventoryBlock.findMany({
      where: {
        branchId,
        cancelledAt: null,
        startDate: { lt: toDate(window.checkOut) },
        endDate: { gt: toDate(window.checkIn) },
      },
      select,
      orderBy: [{ startDate: "asc" }, { physicalRoomId: "asc" }, { id: "asc" }],
    });
    return rows.map(record);
  }

  async findVisible(id: string, visible: BranchVisibility) {
    if (visible !== "ALL" && visible.length === 0) return null;
    const row = await this.client.inventoryBlock.findFirst({
      where: { id, ...visibleWhere(visible) },
      select,
    });
    return row ? record(row) : null;
  }

  /**
   * Takes the row lock first, then reads. Under READ COMMITTED the read after
   * a wait sees what the previous holder committed.
   */
  async lockVisible(
    id: string,
    visible: BranchVisibility,
  ): Promise<Result<BlockRecord | null>> {
    if (visible !== "ALL" && visible.length === 0) return success(null);
    const scope =
      visible === "ALL"
        ? Prisma.empty
        : Prisma.sql`AND "branchId" IN (${Prisma.join([...visible])})`;
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const locked = await this.client.$queryRaw<Readonly<{ id: string }>[]>(
        Prisma.sql`
          SELECT id
          FROM "InventoryBlock"
          WHERE id = ${id} ${scope}
          FOR UPDATE
        `,
      );
      if (locked.length === 0) return success(null);
    } catch (error) {
      if (postgresErrorCode(error) === "55P03") {
        return failure(
          "TRY_AGAIN",
          "Inventory is busy. Please try the request again shortly.",
        );
      }
      throw error;
    }
    const row = await this.client.inventoryBlock.findUnique({
      where: { id },
      select,
    });
    return success(row ? record(row) : null);
  }

  async create(input: BlockCreate) {
    try {
      const row = await this.client.inventoryBlock.create({
        data: {
          id: input.id,
          branchId: input.branchId,
          physicalRoomId: input.physicalRoomId,
          startDate: toDate(input.range.checkIn),
          endDate: toDate(input.range.checkOut),
          reason: input.reason,
          note: input.note,
          createdAt: input.at,
          createdById: input.createdById,
        },
        select,
      });
      return success(record(row));
    } catch (error) {
      return translate(error);
    }
  }

  async update(id: string, change: BlockChange) {
    try {
      const row = await this.client.inventoryBlock.update({
        where: { id },
        data: {
          ...(change.endDate !== undefined
            ? { endDate: toDate(change.endDate) }
            : {}),
          ...(change.note !== undefined ? { note: change.note } : {}),
        },
        select,
      });
      return success(record(row));
    } catch (error) {
      return translate(error);
    }
  }

  async cancel(
    id: string,
    input: Readonly<{ cancelledById: string; at: Date }>,
  ) {
    try {
      const row = await this.client.inventoryBlock.update({
        where: { id },
        data: { cancelledAt: input.at, cancelledById: input.cancelledById },
        select,
      });
      return success(record(row));
    } catch (error) {
      return translate(error);
    }
  }
}
