import "server-only";

import type { InventoryLock } from "@/application/inventory";
import { failure, success, type Result } from "@/application/shared/result";
import { Prisma } from "@/generated/prisma/client";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";

export class PrismaInventoryLock implements InventoryLock {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async lockRoomTypes(
    branchId: string,
    roomTypeIds: readonly string[],
  ): Promise<Result<void>> {
    const ids = [...new Set(roomTypeIds)].sort();
    if (ids.length === 0) return success(undefined);

    try {
      await this.transaction.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const locked = await this.transaction.$queryRaw<
        Readonly<{ id: string }>[]
      >(
        Prisma.sql`
          SELECT id
          FROM "Room"
          WHERE "branchId" = ${branchId}
            AND id IN (${Prisma.join(ids)})
          ORDER BY id
          FOR NO KEY UPDATE
        `,
      );
      if (
        locked.length !== ids.length ||
        locked.some((row, index) => row.id !== ids[index])
      ) {
        return failure("NOT_FOUND", "The requested listing was not found.");
      }
      return success(undefined);
    } catch (error) {
      if (postgresErrorCode(error) === "55P03") {
        return failure(
          "TRY_AGAIN",
          "Inventory is busy. Please try the request again shortly.",
        );
      }
      throw error;
    }
  }
}
