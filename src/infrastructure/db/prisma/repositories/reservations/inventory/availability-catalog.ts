import "server-only";

import type { AvailabilityCatalog } from "@/application/inventory";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

/** Uncached listing and branch reads for availability (P5 and S20). */
export class PrismaAvailabilityCatalog implements AvailabilityCatalog {
  constructor(private readonly client: DatabaseClient) {}

  async findBranch(branchId: string) {
    const branch = await this.client.branch.findUnique({
      where: { id: branchId },
      select: { id: true, timeZone: true, status: true },
    });
    return branch
      ? {
          id: branch.id,
          timeZone: branch.timeZone,
          active: branch.status === "ACTIVE",
        }
      : null;
  }

  async listRoomTypes(branchId: string, scope: "ALL" | "PUBLISHED") {
    return this.client.room.findMany({
      where: {
        branchId,
        ...(scope === "PUBLISHED" ? { status: "PUBLISHED" as const } : {}),
      },
      select: { id: true, name: true, maxAdults: true, maxChildren: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }
}
