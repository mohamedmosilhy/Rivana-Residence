import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  Actor,
  FacilityRepository,
  MediaAssignment,
  FacilityInput,
} from "@/application/ports/repositories";
import {
  failure,
  invalid,
  notPublishable,
  success,
} from "@/application/shared/result";
import {
  assertFacilityPublishable,
  facilityDraftSchema,
} from "@/domain/facilities/facility";
import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import {
  facilityGraph,
  mapFacility,
} from "@/infrastructure/db/prisma/mappers/content-mappers";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";
import { resolveMediaAssignments } from "@/infrastructure/db/prisma/media-assignments";
import { isCompleteOrder } from "@/infrastructure/db/prisma/ordering";

export class PrismaFacilityRepository implements FacilityRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async listPublished() {
    const rows = await this.client.facility.findMany({
      where: { status: "PUBLISHED" },
      include: facilityGraph,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return rows.map(mapFacility);
  }

  async findPublishedBySlug(slug: string) {
    const row = await this.client.facility.findFirst({
      where: { slug, status: "PUBLISHED" },
      include: facilityGraph,
    });
    return row ? mapFacility(row) : null;
  }

  async findAdminById(id: string) {
    const row = await this.client.facility.findUnique({
      where: { id },
      include: facilityGraph,
    });
    return row ? mapFacility(row) : null;
  }

  async listAdmin() {
    const rows = await this.client.facility.findMany({
      include: facilityGraph,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return rows.map(mapFacility);
  }

  async create(input: FacilityInput, actor: Actor) {
    const parsed = facilityDraftSchema.safeParse(input);
    if (!parsed.success) {
      return invalid(
        "Facility is invalid.",
        issuesFromZod(parsed.error.issues),
      );
    }
    try {
      return await withTransaction(this.client, async (transaction) => {
        const last = await transaction.facility.aggregate({
          where: { status: { not: "ARCHIVED" } },
          _max: { sortOrder: true },
        });
        const row = await transaction.facility.create({
          data: {
            ...parsed.data,
            id: createId(),
            description: parsed.data.description as Prisma.InputJsonObject,
            featured: input.featured,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
            status: "DRAFT",
            updatedById: actor.id,
          },
          include: facilityGraph,
        });
        return success(mapFacility(row));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async update(id: string, input: FacilityInput, actor: Actor) {
    const parsed = facilityDraftSchema.safeParse(input);
    if (!parsed.success) {
      return invalid(
        "Facility is invalid.",
        issuesFromZod(parsed.error.issues),
      );
    }
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.facility.findUnique({
          where: { id },
          include: facilityGraph,
        });
        if (!row) return failure("NOT_FOUND", "Facility not found.");

        if (row.status === "PUBLISHED") {
          try {
            assertFacilityPublishable({ ...mapFacility(row), ...parsed.data });
          } catch (error) {
            if (error instanceof DomainValidationError) {
              return notPublishable(error);
            }
            throw error;
          }
        }

        const updated = await transaction.facility.update({
          where: { id },
          data: {
            ...parsed.data,
            description: parsed.data.description as Prisma.InputJsonObject,
            featured: input.featured,
            updatedById: actor.id,
          },
          include: facilityGraph,
        });
        return success(mapFacility(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async publish(id: string, actor: Actor) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.facility.findUnique({
          where: { id },
          include: facilityGraph,
        });
        if (!row) return failure("NOT_FOUND", "Facility not found.");

        try {
          assertFacilityPublishable(mapFacility(row));
        } catch (error) {
          if (error instanceof DomainValidationError) {
            return notPublishable(error);
          }
          throw error;
        }

        const updated = await transaction.facility.update({
          where: { id },
          data: { status: "PUBLISHED", updatedById: actor.id },
          include: facilityGraph,
        });
        return success(mapFacility(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async archive(id: string, actor: Actor) {
    try {
      await this.client.facility.update({
        where: { id },
        data: { status: "ARCHIVED", updatedById: actor.id },
      });
      return success(undefined);
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async reorder(orderedIds: readonly string[], actor: Actor) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const active = await transaction.facility.findMany({
          where: { status: { not: "ARCHIVED" } },
          select: { id: true },
        });
        if (!isCompleteOrder(orderedIds, active)) {
          return failure(
            "VALIDATION",
            "Facility order must contain every active facility exactly once.",
          );
        }
        for (const [index, id] of orderedIds.entries()) {
          await transaction.facility.update({
            where: { id },
            data: { sortOrder: -(index + 1), updatedById: actor.id },
          });
        }
        for (const [index, id] of orderedIds.entries()) {
          await transaction.facility.update({
            where: { id },
            data: { sortOrder: index, updatedById: actor.id },
          });
        }
        return success(undefined);
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async replaceMedia(
    id: string,
    media: readonly MediaAssignment[],
    actor: Actor,
  ) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.facility.findUnique({
          where: { id },
          include: facilityGraph,
        });
        if (!row) return failure("NOT_FOUND", "Facility not found.");

        const resolved = await resolveMediaAssignments(transaction, media);
        if (!resolved.ok) return resolved;

        if (row.status === "PUBLISHED") {
          try {
            assertFacilityPublishable({
              ...mapFacility(row),
              media: resolved.value,
            });
          } catch (error) {
            if (error instanceof DomainValidationError) {
              return notPublishable(error);
            }
            throw error;
          }
        }

        await transaction.facilityMedia.deleteMany({
          where: { facilityId: id },
        });
        await transaction.facilityMedia.createMany({
          data: media.map((assignment) => ({ facilityId: id, ...assignment })),
        });
        const updated = await transaction.facility.update({
          where: { id },
          data: { updatedById: actor.id },
          include: facilityGraph,
        });
        return success(mapFacility(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }
}
