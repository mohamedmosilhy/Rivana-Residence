import "server-only";

import type { PublicListing, PublicListingReader } from "@/application/content";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

/** Reads only what quoting and booking need. No media, facilities or rich text. */
export class PrismaPublicListingReader implements PublicListingReader {
  constructor(private readonly client: DatabaseClient) {}

  async listPublished(branchId: string): Promise<readonly PublicListing[]> {
    return this.client.room.findMany({
      where: { branchId, status: "PUBLISHED" },
      select: {
        id: true,
        branchId: true,
        slug: true,
        name: true,
        accommodationType: true,
        maxAdults: true,
        maxChildren: true,
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }
}
