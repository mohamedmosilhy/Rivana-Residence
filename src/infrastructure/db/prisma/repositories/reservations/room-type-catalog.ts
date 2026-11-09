import "server-only";

import type { RoomTypeCatalog } from "@/application/inventory";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

/** Listing and branch identity for inventory writers, nothing more. */
export class PrismaRoomTypeCatalog implements RoomTypeCatalog {
  constructor(private readonly client: DatabaseClient) {}

  findBranch(branchId: string) {
    return this.client.branch.findUnique({
      where: { id: branchId },
      select: { id: true, timeZone: true },
    });
  }

  async branchOwnsRoomType(branchId: string, roomTypeId: string) {
    const room = await this.client.room.findFirst({
      where: { id: roomTypeId, branchId },
      select: { id: true },
    });
    return room !== null;
  }
}
