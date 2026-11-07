import "server-only";

import type {
  AdminOverviewDto,
  AdminOverviewReader,
  PublicationCounts,
  RecentContentItem,
} from "@/application/ports/repositories";
import type { PublicationStatus } from "@/domain/shared/types";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

function publicationCounts(
  groups: readonly { status: PublicationStatus; _count: { _all: number } }[],
): PublicationCounts {
  const counts = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}

export class PrismaAdminOverviewReader implements AdminOverviewReader {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async read(now: Date, recentLimit: number): Promise<AdminOverviewDto> {
    const db = this.client;
    const recent = {
      orderBy: { updatedAt: "desc" as const },
      take: recentLimit,
    };
    const [
      settings,
      pages,
      publishedPages,
      rooms,
      facilities,
      readyMedia,
      missingAltText,
      failedMedia,
      newEnquiries,
      failedEnquiries,
      recentPages,
      recentRooms,
      recentFacilities,
    ] = await Promise.all([
      db.siteSettings.findUnique({
        where: { id: "default" },
        select: { timeZone: true, updatedAt: true },
      }),
      db.page.count(),
      db.page.count({ where: { isPublished: true } }),
      db.room.groupBy({ by: ["status"], _count: { _all: true } }),
      db.facility.groupBy({ by: ["status"], _count: { _all: true } }),
      db.mediaAsset.count({ where: { status: "READY" } }),
      db.mediaAsset.count({ where: { status: "READY", altText: "" } }),
      db.mediaAsset.count({ where: { status: "FAILED" } }),
      db.contactEnquiry.count({ where: { status: "NEW" } }),
      db.contactEnquiry.count({ where: { status: "DELIVERY_FAILED" } }),
      db.page.findMany({
        ...recent,
        select: { id: true, title: true, isPublished: true, updatedAt: true },
      }),
      db.room.findMany({
        ...recent,
        select: { id: true, name: true, status: true, updatedAt: true },
      }),
      db.facility.findMany({
        ...recent,
        select: { id: true, name: true, status: true, updatedAt: true },
      }),
    ]);

    const recentItems: RecentContentItem[] = [
      ...recentPages.map((page) => ({
        kind: "PAGE" as const,
        id: page.id,
        title: page.title,
        status: page.isPublished ? ("PUBLISHED" as const) : ("DRAFT" as const),
        updatedAt: page.updatedAt,
      })),
      ...recentRooms.map((room) => ({
        kind: "ROOM" as const,
        id: room.id,
        title: room.name,
        status: room.status,
        updatedAt: room.updatedAt,
      })),
      ...recentFacilities.map((facility) => ({
        kind: "FACILITY" as const,
        id: facility.id,
        title: facility.name,
        status: facility.status,
        updatedAt: facility.updatedAt,
      })),
      ...(settings
        ? [
            {
              kind: "SETTINGS" as const,
              id: "default",
              title: "Site settings",
              status: null,
              updatedAt: settings.updatedAt,
            },
          ]
        : []),
    ];

    return {
      timeZone: settings?.timeZone ?? "Africa/Cairo",
      pages: { published: publishedPages, total: pages },
      rooms: publicationCounts(rooms),
      facilities: publicationCounts(facilities),
      media: {
        ready: readyMedia,
        missingAltText,
        failed: failedMedia,
      },
      enquiries: { new: newEnquiries, deliveryFailed: failedEnquiries },
      recent: recentItems
        .sort(
          (left, right) =>
            right.updatedAt.getTime() - left.updatedAt.getTime() ||
            left.id.localeCompare(right.id),
        )
        .slice(0, recentLimit),
    };
  }
}
