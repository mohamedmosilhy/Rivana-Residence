import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  BranchCatalogFlags,
  BranchPageSeed,
  BranchRecord,
  BranchRepository,
  BranchRow,
} from "@/application/branches";
import type { Result } from "@/application/shared/result";
import { success } from "@/application/shared/result";
import type { AuditEvent } from "@/domain/audit";
import type {
  BranchCreateAttributes,
  BranchUpdateAttributes,
} from "@/domain/branches";
import type { AccommodationType } from "@/domain/shared/types";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import {
  withTransaction,
  type DatabaseClient,
} from "@/infrastructure/db/prisma/transaction";

const record = {
  id: true,
  slug: true,
  name: true,
  status: true,
  sortOrder: true,
} as const;

const row = {
  ...record,
  summary: true,
  onlineBookingEnabled: true,
  timeZone: true,
  phone: true,
  email: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  country: true,
  latitude: true,
  longitude: true,
  mapEmbedUrl: true,
  checkInTime: true,
  checkOutTime: true,
  heroMediaId: true,
  syncReminderIntervalMinutes: true,
  syncFollowUpMinutes: true,
  updatedAt: true,
} as const;

type RowRecord = Prisma.BranchGetPayload<{ select: typeof row }>;

const defaultOrder = [{ sortOrder: "asc" }, { id: "asc" }] as const;

function toRow(value: RowRecord): BranchRow {
  return {
    ...value,
    latitude: value.latitude === null ? null : value.latitude.toNumber(),
    longitude: value.longitude === null ? null : value.longitude.toNumber(),
  };
}

/** Prisma data for the editable columns present in an input or patch. */
function columns(input: BranchUpdateAttributes) {
  const data: Prisma.BranchUncheckedUpdateInput = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    (data as Record<string, unknown>)[key] =
      (key === "latitude" || key === "longitude") && value !== null
        ? new Prisma.Decimal(value as number)
        : value;
  }
  return data;
}

export class PrismaBranchRepository implements BranchRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async findDefaultActive(): Promise<BranchRecord | null> {
    return this.client.branch.findFirst({
      where: { status: "ACTIVE" },
      select: record,
      orderBy: [...defaultOrder],
    });
  }

  async findDefault(): Promise<BranchRecord | null> {
    return this.client.branch.findFirst({
      select: record,
      orderBy: [...defaultOrder],
    });
  }

  async findById(id: string): Promise<BranchRecord | null> {
    return this.client.branch.findUnique({ where: { id }, select: record });
  }

  async findBySlug(slug: string): Promise<BranchRecord | null> {
    return this.client.branch.findUnique({ where: { slug }, select: record });
  }

  async listAll(): Promise<readonly BranchRecord[]> {
    return this.client.branch.findMany({
      select: record,
      orderBy: [...defaultOrder],
    });
  }

  async listActiveRows(): Promise<readonly BranchRow[]> {
    const rows = await this.client.branch.findMany({
      where: { status: "ACTIVE" },
      select: row,
      orderBy: [...defaultOrder],
    });
    return rows.map(toRow);
  }

  async listRows(): Promise<readonly BranchRow[]> {
    const rows = await this.client.branch.findMany({
      select: row,
      orderBy: [...defaultOrder],
    });
    return rows.map(toRow);
  }

  async findRowById(id: string): Promise<BranchRow | null> {
    const found = await this.client.branch.findUnique({
      where: { id },
      select: row,
    });
    return found ? toRow(found) : null;
  }

  async findActiveRowBySlug(slug: string): Promise<BranchRow | null> {
    const found = await this.client.branch.findFirst({
      where: { slug, status: "ACTIVE" },
      select: row,
    });
    return found ? toRow(found) : null;
  }

  async catalogFlags(
    branchIds: readonly string[],
  ): Promise<readonly BranchCatalogFlags[]> {
    if (branchIds.length === 0) return [];
    const ids = [...branchIds];
    const [rooms, facilities] = await Promise.all([
      this.client.room.groupBy({
        by: ["branchId", "accommodationType"],
        where: { branchId: { in: ids }, status: "PUBLISHED" },
      }),
      this.client.facility.groupBy({
        by: ["branchId"],
        where: { branchId: { in: ids }, status: "PUBLISHED" },
      }),
    ]);
    return ids.map((branchId) => ({
      branchId,
      stayTypes: rooms
        .filter((group) => group.branchId === branchId)
        .map((group) => group.accommodationType as AccommodationType)
        .sort(),
      hasFacilities: facilities.some((group) => group.branchId === branchId),
    }));
  }

  async publishedSlugs(branchId: string) {
    const [rooms, facilities] = await Promise.all([
      this.client.room.findMany({
        where: { branchId, status: "PUBLISHED" },
        select: { slug: true },
      }),
      this.client.facility.findMany({
        where: { branchId, status: "PUBLISHED" },
        select: { slug: true },
      }),
    ]);
    return {
      rooms: rooms.map((item) => item.slug),
      facilities: facilities.map((item) => item.slug),
    };
  }

  async create(
    input: BranchCreateAttributes,
    pages: readonly BranchPageSeed[],
    audit: (branchId: string) => AuditEvent,
  ): Promise<Result<BranchRow>> {
    const id = createId();
    try {
      const created = await withTransaction(this.client, async (tx) => {
        const branch = await tx.branch.create({
          data: {
            ...(columns(input) as Prisma.BranchUncheckedCreateInput),
            id,
            slug: input.slug,
            name: input.name,
            sortOrder: input.sortOrder,
            updatedById: audit(id).actorId,
          },
          select: row,
        });
        for (const page of pages) {
          const pageId = createId();
          await tx.page.create({
            data: {
              id: pageId,
              branchId: id,
              key: page.key,
              title: page.title,
              canonicalPath: page.canonicalPath,
              isPublished: false,
            },
          });
          await tx.pageSection.createMany({
            data: page.sections.map((section, index) => ({
              id: createId(),
              pageId,
              type: section.type,
              heading: section.heading ?? null,
              eyebrow: section.eyebrow ?? null,
              isVisible: section.isVisible,
              payload: section.payload as Prisma.InputJsonObject,
              sortOrder: index,
            })),
          });
        }
        await new PrismaAuditLog(tx).append(audit(id));
        return branch;
      });
      return success(toRow(created));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async update(
    id: string,
    patch: BranchUpdateAttributes,
    actorId: string,
    audit: AuditEvent | null,
  ): Promise<Result<BranchRow>> {
    try {
      const updated = await withTransaction(this.client, async (tx) => {
        const branch = await tx.branch.update({
          where: { id },
          data: { ...columns(patch), updatedById: actorId },
          select: row,
        });
        if (audit) await new PrismaAuditLog(tx).append(audit);
        return branch;
      });
      return success(toRow(updated));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }
}
