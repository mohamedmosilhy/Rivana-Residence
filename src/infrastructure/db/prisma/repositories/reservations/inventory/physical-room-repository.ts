import "server-only";

import type {
  ActiveBlockRange,
  BranchVisibility,
  PhysicalRoomChange,
  PhysicalRoomCreate,
  PhysicalRoomRecord,
  PhysicalRoomRepository,
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
  roomTypeId: true,
  label: true,
  active: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

const LABEL_TAKEN = "That label is already used in this branch.";

function visibleWhere(visible: BranchVisibility) {
  return visible === "ALL" ? {} : { branchId: { in: [...visible] } };
}

/** Unique violation. Ids are generated, so only (branchId, label) can collide. */
function isDuplicate(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002") ||
    postgresErrorCode(error) === "23505"
  );
}

/** Whether a foreign key error names the listing key rather than the updater. */
function isListingKey(error: unknown) {
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}));
  return !/updatedById/.test(text);
}

function translate(error: unknown): Result<never> {
  if (isDuplicate(error)) {
    return failure("CONFLICT", LABEL_TAKEN, { label: [LABEL_TAKEN] });
  }
  // The composite foreign key refuses a listing outside the branch.
  if (
    ((error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003") ||
      postgresErrorCode(error) === "23503") &&
    isListingKey(error)
  ) {
    return failure("NOT_FOUND", "This listing was not found in the branch.");
  }
  throw error;
}

export class PrismaPhysicalRoomRepository implements PhysicalRoomRepository {
  constructor(private readonly client: DatabaseClient) {}

  listByBranch(branchId: string): Promise<readonly PhysicalRoomRecord[]> {
    return this.client.physicalRoom.findMany({
      where: { branchId },
      select,
      orderBy: [
        { roomType: { sortOrder: "asc" } },
        { roomTypeId: "asc" },
        { label: "asc" },
        { id: "asc" },
      ],
    });
  }

  findVisible(id: string, visible: BranchVisibility) {
    if (visible !== "ALL" && visible.length === 0) return Promise.resolve(null);
    return this.client.physicalRoom.findFirst({
      where: { id, ...visibleWhere(visible) },
      select,
    });
  }

  /**
   * Takes the row lock first, then reads. Under READ COMMITTED the read after
   * a wait sees what the previous holder committed.
   */
  async lockVisible(
    id: string,
    visible: BranchVisibility,
  ): Promise<Result<PhysicalRoomRecord | null>> {
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
          FROM "PhysicalRoom"
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
    return success(
      await this.client.physicalRoom.findUnique({ where: { id }, select }),
    );
  }

  async listActiveBlocks(
    physicalRoomId: string,
  ): Promise<readonly ActiveBlockRange[]> {
    const blocks = await this.client.inventoryBlock.findMany({
      where: { physicalRoomId, cancelledAt: null },
      select: { id: true, startDate: true, endDate: true },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    return blocks.map((block) => ({
      id: block.id,
      range: StayRange.create(
        LocalDate.parse(block.startDate.toISOString().slice(0, 10)),
        LocalDate.parse(block.endDate.toISOString().slice(0, 10)),
      ),
    }));
  }

  async create(input: PhysicalRoomCreate) {
    try {
      return success(
        await this.client.physicalRoom.create({
          data: {
            id: input.id,
            branchId: input.branchId,
            roomTypeId: input.roomTypeId,
            label: input.label,
            notes: input.notes,
            active: true,
            createdAt: input.at,
            updatedAt: input.at,
            updatedById: input.createdById,
          },
          select,
        }),
      );
    } catch (error) {
      return translate(error);
    }
  }

  async update(id: string, change: PhysicalRoomChange) {
    try {
      return success(
        await this.client.physicalRoom.update({
          where: { id },
          data: {
            ...(change.label !== undefined ? { label: change.label } : {}),
            ...(change.notes !== undefined ? { notes: change.notes } : {}),
            ...(change.active !== undefined ? { active: change.active } : {}),
            updatedAt: change.at,
            updatedById: change.updatedById,
          },
          select,
        }),
      );
    } catch (error) {
      return translate(error);
    }
  }
}
