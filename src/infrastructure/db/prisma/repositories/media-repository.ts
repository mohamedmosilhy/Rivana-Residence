import "server-only";

import type { MediaRepository } from "@/application/ports/repositories";
import { failure, success } from "@/application/shared/result";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import { mapMedia } from "@/infrastructure/db/prisma/mappers/content-mappers";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";

const mediaSelection = {
  id: true,
  storageProvider: true,
  storageContainer: true,
  storageKey: true,
  mimeType: true,
  bytes: true,
  width: true,
  height: true,
  altText: true,
  status: true,
} as const;

async function usageCount(client: DatabaseClient, id: string) {
  const counts = await Promise.all([
    client.pageSectionMedia.count({ where: { mediaId: id } }),
    client.roomMedia.count({ where: { mediaId: id } }),
    client.facilityMedia.count({ where: { mediaId: id } }),
    client.page.count({ where: { ogMediaId: id } }),
    client.room.count({ where: { ogMediaId: id } }),
    client.facility.count({ where: { ogMediaId: id } }),
    client.siteSettings.count({
      where: {
        OR: [
          { logoMediaId: id },
          { stickyLogoMediaId: id },
          { faviconMediaId: id },
        ],
      },
    }),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

export class PrismaMediaRepository implements MediaRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async findAdminById(id: string) {
    const row = await this.client.mediaAsset.findUnique({
      where: { id },
      select: mediaSelection,
    });
    return row ? mapMedia(row) : null;
  }

  countUsage(id: string) {
    return usageCount(this.client, id);
  }

  async finalize(id: string) {
    try {
      const updated = await this.client.mediaAsset.update({
        where: { id, status: "PENDING" },
        data: { status: "READY" },
        select: mediaSelection,
      });
      return success(mapMedia(updated));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async deleteIfUnreferenced(id: string) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const media = await transaction.mediaAsset.findUnique({
          where: { id },
        });
        if (!media) return failure("NOT_FOUND", "Media asset not found.");
        if ((await usageCount(transaction, id)) > 0) {
          return failure("REFERENCED", "Referenced media cannot be deleted.");
        }
        await transaction.mediaAsset.update({
          where: { id },
          data: { status: "DELETED", publicUrl: null },
        });
        return success(undefined);
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }
}
