import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  Actor,
  AdminSiteSettingsDto,
  SettingsRepository,
  SiteImagesInput,
} from "@/application/ports/repositories";
import { failure, success, type Result } from "@/application/shared/result";
import type {
  SiteSettingsInput,
  SocialLinkInput,
} from "@/domain/settings/site-settings";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import { mapSettings } from "@/infrastructure/db/prisma/mappers/content-mappers";
import { requireReadyImage } from "@/infrastructure/db/prisma/media-assignments";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";

const SINGLETON_ID = "default";

const STALE_MESSAGE =
  "Someone else saved these settings after you opened them. Reload the page to see their changes, then try again.";

async function readAdmin(
  client: DatabaseClient,
): Promise<AdminSiteSettingsDto | null> {
  const row = await client.siteSettings.findUnique({
    where: { id: SINGLETON_ID },
    include: {
      socialLinks: true,
      updatedBy: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    ...mapSettings(row),
    updatedAt: row.updatedAt,
    updatedByName: row.updatedBy?.name ?? null,
  };
}

async function staleOrMissing(
  client: Prisma.TransactionClient,
): Promise<Result<never>> {
  const exists = await client.siteSettings.count({
    where: { id: SINGLETON_ID },
  });
  return exists
    ? failure("CONFLICT", STALE_MESSAGE)
    : failure("NOT_FOUND", "Site settings have not been initialized.");
}

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async getPublic() {
    const row = await this.client.siteSettings.findUnique({
      where: { id: SINGLETON_ID },
      include: {
        socialLinks: { where: { isVisible: true } },
      },
    });
    return row ? mapSettings(row) : null;
  }

  getAdmin() {
    return readAdmin(this.client);
  }

  async update(
    input: SiteSettingsInput,
    expectedUpdatedAt: Date,
    actor: Actor,
  ): Promise<Result<AdminSiteSettingsDto>> {
    try {
      return await withTransaction(this.client, async (transaction) => {
        // The version predicate and the write are one statement, so two
        // editors saving the same version cannot both succeed.
        const { count } = await transaction.siteSettings.updateMany({
          where: { id: SINGLETON_ID, updatedAt: expectedUpdatedAt },
          data: { ...input, updatedById: actor.id },
        });
        if (count === 0) return staleOrMissing(transaction);
        return success((await readAdmin(transaction))!);
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async replaceSocialLinks(
    links: readonly SocialLinkInput[],
    expectedUpdatedAt: Date,
    actor: Actor,
  ): Promise<Result<AdminSiteSettingsDto>> {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const { count } = await transaction.siteSettings.updateMany({
          where: { id: SINGLETON_ID, updatedAt: expectedUpdatedAt },
          data: { updatedById: actor.id },
        });
        if (count === 0) return staleOrMissing(transaction);

        await transaction.socialLink.deleteMany({
          where: { siteSettingsId: SINGLETON_ID },
        });
        if (links.length > 0) {
          await transaction.socialLink.createMany({
            data: links.map((link, index) => ({
              id: createId(),
              siteSettingsId: SINGLETON_ID,
              platform: link.platform,
              label: link.label,
              url: link.url,
              isVisible: link.isVisible,
              sortOrder: index,
            })),
          });
        }
        return success((await readAdmin(transaction))!);
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async updateImages(
    input: SiteImagesInput,
    actor: Actor,
  ): Promise<Result<AdminSiteSettingsDto>> {
    try {
      return await withTransaction(this.client, async (transaction) => {
        for (const mediaId of Object.values(input)) {
          if (!mediaId) continue;
          const ready = await requireReadyImage(transaction, mediaId);
          if (!ready.ok) return ready;
        }
        const { count } = await transaction.siteSettings.updateMany({
          where: { id: SINGLETON_ID },
          data: { ...input, updatedById: actor.id },
        });
        if (count === 0) {
          return failure(
            "NOT_FOUND",
            "Site settings have not been initialized.",
          );
        }
        return success((await readAdmin(transaction))!);
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }
}
