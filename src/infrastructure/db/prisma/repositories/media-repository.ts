import "server-only";

import type {
  Actor,
  MediaListQuery,
  MediaRepository,
  MediaRightsStatus,
  MediaUsage,
  PendingMediaInput,
  ReadyMediaInput,
} from "@/application/ports/repositories";
import { failure, success } from "@/application/shared/result";
import type { MediaDetailsInput } from "@/domain/media/media-asset";
import { PAGE_SECTION_LABELS } from "@/domain/content/page-sections";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import { mapMedia } from "@/infrastructure/db/prisma/mappers/content-mappers";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";

const SETTINGS_ROLES = {
  logoMediaId: "Logo",
  stickyLogoMediaId: "Compact logo",
  faviconMediaId: "Favicon",
  defaultOgMediaId: "Default sharing image",
} as const;

// Every relation that can point at an image. Deletion, usage lists, and
// replacement all derive from this one list.
const usageCounts = {
  roomUsage: true,
  facilityUsage: true,
  pageSectionUsage: true,
  pageOgFor: true,
  roomOgFor: true,
  facilityOgFor: true,
  siteLogoFor: true,
  siteStickyFor: true,
  siteFaviconFor: true,
  siteDefaultOgFor: true,
} as const;

type UsageCountRow = Record<keyof typeof usageCounts, number>;

function totalUsage(counts: UsageCountRow) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function usedWhere(): Prisma.MediaAssetWhereInput[] {
  return (Object.keys(usageCounts) as (keyof typeof usageCounts)[]).map(
    (relation) => ({ [relation]: { some: {} } }),
  );
}

async function usageCount(client: DatabaseClient, id: string) {
  const row = await client.mediaAsset.findUnique({
    where: { id },
    select: { _count: { select: usageCounts } },
  });
  return row ? totalUsage(row._count) : 0;
}

async function usageOf(
  client: DatabaseClient,
  id: string,
): Promise<MediaUsage[]> {
  const [rooms, facilities, sections, pages, roomOg, facilityOg, settings] =
    await Promise.all([
      client.roomMedia.findMany({
        where: { mediaId: id },
        select: {
          role: true,
          room: { select: { id: true, name: true, slug: true, status: true } },
        },
      }),
      client.facilityMedia.findMany({
        where: { mediaId: id },
        select: {
          role: true,
          facility: {
            select: { id: true, name: true, slug: true, status: true },
          },
        },
      }),
      client.pageSectionMedia.findMany({
        where: { mediaId: id },
        select: {
          section: {
            select: {
              type: true,
              isVisible: true,
              page: { select: { key: true, title: true, isPublished: true } },
            },
          },
        },
      }),
      client.page.findMany({
        where: { ogMediaId: id },
        select: { key: true, title: true, isPublished: true },
      }),
      client.room.findMany({
        where: { ogMediaId: id },
        select: { id: true, name: true, slug: true, status: true },
      }),
      client.facility.findMany({
        where: { ogMediaId: id },
        select: { id: true, name: true, slug: true, status: true },
      }),
      client.siteSettings.findMany({
        where: {
          OR: Object.keys(SETTINGS_ROLES).map((field) => ({ [field]: id })),
        },
        select: {
          logoMediaId: true,
          stickyLogoMediaId: true,
          faviconMediaId: true,
          defaultOgMediaId: true,
        },
      }),
    ]);

  const role = (value: "HERO" | "GALLERY") =>
    value === "HERO" ? "Hero image" : "Gallery";

  return [
    ...rooms.map(({ role: usageRole, room }) => ({
      kind: "ROOM" as const,
      ownerId: room.id,
      ownerName: room.name,
      role: role(usageRole),
      isPublic: room.status === "PUBLISHED",
      slug: room.slug,
    })),
    ...facilities.map(({ role: usageRole, facility }) => ({
      kind: "FACILITY" as const,
      ownerId: facility.id,
      ownerName: facility.name,
      role: role(usageRole),
      isPublic: facility.status === "PUBLISHED",
      slug: facility.slug,
    })),
    ...sections.map(({ section }) => ({
      kind: "PAGE_SECTION" as const,
      ownerId: section.page.key,
      ownerName: `${section.page.title} page`,
      role: `${PAGE_SECTION_LABELS[section.type]} section`,
      isPublic: section.page.isPublished && section.isVisible,
      slug: null,
    })),
    ...pages.map((page) => ({
      kind: "PAGE_SHARING" as const,
      ownerId: page.key,
      ownerName: `${page.title} page`,
      role: "Sharing image",
      isPublic: page.isPublished,
      slug: null,
    })),
    ...roomOg.map((room) => ({
      kind: "ROOM_SHARING" as const,
      ownerId: room.id,
      ownerName: room.name,
      role: "Sharing image",
      isPublic: room.status === "PUBLISHED",
      slug: room.slug,
    })),
    ...facilityOg.map((facility) => ({
      kind: "FACILITY_SHARING" as const,
      ownerId: facility.id,
      ownerName: facility.name,
      role: "Sharing image",
      isPublic: facility.status === "PUBLISHED",
      slug: facility.slug,
    })),
    ...settings.flatMap((row) =>
      (Object.keys(SETTINGS_ROLES) as (keyof typeof SETTINGS_ROLES)[])
        .filter((field) => row[field] === id)
        .map((field) => ({
          kind: "SITE_SETTINGS" as const,
          ownerId: "default",
          ownerName: "Site settings",
          role: SETTINGS_ROLES[field],
          isPublic: true,
          slug: null,
        })),
    ),
  ];
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export class PrismaMediaRepository implements MediaRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async findAdminById(id: string) {
    const row = await this.client.mediaAsset.findUnique({ where: { id } });
    return row ? mapMedia(row) : null;
  }

  async listReady() {
    const rows = await this.client.mediaAsset.findMany({
      where: { status: "READY" },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        storageKey: true,
        altText: true,
        originalFilename: true,
        width: true,
        height: true,
        rightsStatus: true,
      },
    });
    return rows.map(({ rightsStatus, ...row }) => ({
      ...row,
      rightsConfirmed: rightsStatus === "CONFIRMED",
    }));
  }

  countUsage(id: string) {
    return usageCount(this.client, id);
  }

  async finalize(id: string) {
    try {
      const updated = await this.client.mediaAsset.update({
        where: { id, status: "PENDING" },
        data: { status: "READY" },
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

  async createPending(input: PendingMediaInput) {
    try {
      const row = await this.client.mediaAsset.create({
        data: {
          id: input.id,
          storageProvider: "local",
          storageContainer: "media",
          storageKey: input.storageKey,
          originalFilename: input.originalFilename,
          mimeType: input.mimeType,
          bytes: Math.max(1, input.declaredBytes),
          altText: input.altText,
          rightsStatus: input.rightsStatus,
          sourceReference: input.sourceReference,
          createdById: input.createdById,
          status: "PENDING",
        },
      });
      return success(mapMedia(row));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async markReady(id: string, input: ReadyMediaInput) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.mediaAsset.findUnique({ where: { id } });
        if (!row) return failure("NOT_FOUND", "Media asset not found.");
        if (row.status === "READY") return success(mapMedia(row));
        if (row.status !== "PENDING") {
          return failure("CONFLICT", "This upload can no longer be finished.");
        }
        const updated = await transaction.mediaAsset.update({
          where: { id },
          data: { ...input, status: "READY", failureReason: null },
        });
        return success(mapMedia(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async markFailed(id: string, reason: string) {
    await this.client.mediaAsset.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "FAILED", failureReason: reason.slice(0, 200) },
    });
  }

  async findReadyByChecksum(checksum: string) {
    const row = await this.client.mediaAsset.findFirst({
      where: { checksum, status: "READY" },
    });
    return row ? mapMedia(row) : null;
  }

  async findBySourceReference(reference: string) {
    const row = await this.client.mediaAsset.findFirst({
      where: { sourceReference: reference, status: { not: "DELETED" } },
      orderBy: { createdAt: "desc" },
    });
    return row ? mapMedia(row) : null;
  }

  async findServable(storageKey: string) {
    return this.client.mediaAsset.findFirst({
      where: { storageKey, status: "READY" },
      select: { storageKey: true, mimeType: true, bytes: true, checksum: true },
    });
  }

  async list(query: MediaListQuery) {
    const contains = query.search
      ? { contains: escapeLike(query.search), mode: "insensitive" as const }
      : undefined;
    const used = usedWhere();
    const where: Prisma.MediaAssetWhereInput = {
      status: query.status ?? { not: "DELETED" },
      ...(query.mimeType ? { mimeType: query.mimeType } : {}),
      ...(query.rights ? { rightsStatus: query.rights } : {}),
      ...(query.missingAlt ? { altText: "" } : {}),
      AND: [
        contains
          ? {
              OR: [
                { altText: contains },
                { originalFilename: contains },
                { caption: contains },
              ],
            }
          : {},
        query.usage === "used" ? { OR: used } : {},
        query.usage === "unused"
          ? {
              NOT: { OR: used },
            }
          : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.client.mediaAsset.count({ where }),
      this.client.mediaAsset.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: usageCounts } },
      }),
    ]);
    return {
      items: rows.map(({ _count, ...row }) => ({
        ...mapMedia(row),
        usageCount: totalUsage(_count),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getDetails(id: string) {
    const row = await this.client.mediaAsset.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } } },
    });
    if (!row) return null;
    const { createdBy, ...asset } = row;
    return {
      ...mapMedia(asset),
      createdByName: createdBy?.name ?? null,
      usage: await usageOf(this.client, id),
    };
  }

  async updateDetails(id: string, input: MediaDetailsInput) {
    try {
      const updated = await this.client.mediaAsset.update({
        where: { id, status: { not: "DELETED" } },
        data: input,
      });
      return success(mapMedia(updated));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async setRightsStatus(id: string, status: MediaRightsStatus) {
    try {
      const updated = await this.client.mediaAsset.update({
        where: { id, status: { not: "DELETED" } },
        data: { rightsStatus: status },
      });
      return success(mapMedia(updated));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async replaceReferences(fromId: string, toId: string, actor: Actor) {
    if (fromId === toId) {
      return failure("VALIDATION", "Choose a different image.");
    }
    try {
      return await withTransaction(this.client, async (transaction) => {
        const [from, to] = await Promise.all([
          transaction.mediaAsset.findUnique({ where: { id: fromId } }),
          transaction.mediaAsset.findUnique({ where: { id: toId } }),
        ]);
        if (!from || !to) return failure("NOT_FOUND", "Image not found.");
        if (to.status !== "READY") {
          return failure(
            "CONFLICT",
            "The new image must finish uploading before it can replace another.",
          );
        }
        const usage = await usageOf(transaction, fromId);
        if (
          to.rightsStatus !== "CONFIRMED" &&
          usage.some((item) => item.isPublic)
        ) {
          return failure(
            "NOT_PUBLISHABLE",
            "The new image is used on published content, so its usage rights must be confirmed first.",
          );
        }

        const moved = await Promise.all([
          transaction.roomMedia.updateMany({
            where: { mediaId: fromId },
            data: { mediaId: toId },
          }),
          transaction.facilityMedia.updateMany({
            where: { mediaId: fromId },
            data: { mediaId: toId },
          }),
          transaction.pageSectionMedia.updateMany({
            where: { mediaId: fromId },
            data: { mediaId: toId },
          }),
          transaction.page.updateMany({
            where: { ogMediaId: fromId },
            data: { ogMediaId: toId, updatedById: actor.id },
          }),
          transaction.room.updateMany({
            where: { ogMediaId: fromId },
            data: { ogMediaId: toId, updatedById: actor.id },
          }),
          transaction.facility.updateMany({
            where: { ogMediaId: fromId },
            data: { ogMediaId: toId, updatedById: actor.id },
          }),
          ...Object.keys(SETTINGS_ROLES).map((field) =>
            transaction.siteSettings.updateMany({
              where: { [field]: fromId },
              data: { [field]: toId, updatedById: actor.id },
            }),
          ),
        ]);

        // Carry over descriptive details the new upload does not have yet.
        await transaction.mediaAsset.update({
          where: { id: toId },
          data: {
            ...(to.altText.trim() ? {} : { altText: from.altText }),
            ...(to.caption ? {} : { caption: from.caption }),
            ...(to.credit ? {} : { credit: from.credit }),
          },
        });
        return success({
          replaced: moved.reduce((total, result) => total + result.count, 0),
        });
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async markDeleted(id: string) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.mediaAsset.findUnique({ where: { id } });
        if (!row) return failure("NOT_FOUND", "Image not found.");
        if (row.status === "DELETED") return success(mapMedia(row));
        if (row.status === "PENDING") {
          return failure("CONFLICT", "This image is still uploading.");
        }
        const count = await usageCount(transaction, id);
        if (count > 0) {
          return failure(
            "REFERENCED",
            `This image is used in ${count} place${count === 1 ? "" : "s"}. Replace or remove it there first.`,
          );
        }
        const updated = await transaction.mediaAsset.update({
          where: { id },
          data: { status: "DELETED", publicUrl: null },
        });
        return success(mapMedia(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async purge(id: string) {
    try {
      await this.client.mediaAsset.deleteMany({
        where: { id, status: { in: ["DELETED", "FAILED"] } },
      });
    } catch (error) {
      // Still referenced (only possible for a FAILED asset attached before
      // it failed): keep the row; the reference must be removed first.
      const result = translatePrismaWriteError(error);
      if (result.ok || result.error.code !== "REFERENCED") throw error;
    }
  }

  async cleanupCandidates(pendingBefore: Date, failedBefore: Date) {
    const [stalePending, deleted, failed] = await Promise.all([
      this.client.mediaAsset.findMany({
        where: { status: "PENDING", createdAt: { lt: pendingBefore } },
        select: { id: true },
      }),
      this.client.mediaAsset.findMany({
        where: { status: "DELETED" },
        select: { id: true, storageKey: true },
      }),
      this.client.mediaAsset.findMany({
        where: { status: "FAILED", updatedAt: { lt: failedBefore } },
        select: { id: true },
      }),
    ]);
    return { stalePending, deleted, failed };
  }
}
