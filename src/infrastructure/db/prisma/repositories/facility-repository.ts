import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  Actor,
  MediaAssignment,
  FacilityInput,
  FacilityRepository,
} from "@/application/ports/repositories";
import { failure, invalid, success } from "@/application/shared/result";
import { issuesFromZod } from "@/domain/shared/domain-error";
import {
  assertFacilityPublishable,
  facilityDraftSchema,
} from "@/domain/facilities/facility";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import {
  mapFacility,
  facilityGraph,
} from "@/infrastructure/db/prisma/mappers/content-mappers";
import {
  requireReadyImage,
  resolveMediaAssignments,
} from "@/infrastructure/db/prisma/media-assignments";
import { isCompleteOrder } from "@/infrastructure/db/prisma/ordering";
import { publishabilityFailure } from "@/infrastructure/db/prisma/publication-guard";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";

function parse(input: FacilityInput) {
  const parsed = facilityDraftSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : invalid("Facility is invalid.", issuesFromZod(parsed.error.issues));
}

async function nextSortOrder(transaction: Prisma.TransactionClient) {
  const last = await transaction.facility.aggregate({
    where: { status: { not: "ARCHIVED" } },
    _max: { sortOrder: true },
  });
  return (last._max.sortOrder ?? -1) + 1;
}

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
    const parsed = parse(input);
    if (!parsed.ok) return parsed;
    const fields = parsed.value;
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.facility.create({
          data: {
            ...fields,
            id: createId(),
            description: fields.description as Prisma.InputJsonObject,
            featured: input.featured,
            sortOrder: await nextSortOrder(transaction),
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
    const parsed = parse(input);
    if (!parsed.ok) return parsed;
    const fields = parsed.value;
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.facility.findUnique({
          where: { id },
          include: facilityGraph,
        });
        if (!row) return failure("NOT_FOUND", "Facility not found.");

        if (row.status === "PUBLISHED") {
          const blocked = publishabilityFailure(() =>
            assertFacilityPublishable({ ...mapFacility(row), ...parsed.value }),
          );
          if (blocked) return blocked;
        }

        const updated = await transaction.facility.update({
          where: { id },
          data: {
            ...fields,
            description: fields.description as Prisma.InputJsonObject,
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
        if (row.status === "ARCHIVED") {
          return failure(
            "CONFLICT",
            "Restore this facility before publishing.",
          );
        }

        const blocked = publishabilityFailure(() =>
          assertFacilityPublishable(mapFacility(row)),
        );
        if (blocked) return blocked;

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

  async unpublish(id: string, actor: Actor) {
    return this.transition(id, "PUBLISHED", "DRAFT", actor);
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

  async restore(id: string, actor: Actor) {
    return this.transition(id, "ARCHIVED", "DRAFT", actor);
  }

  async delete(id: string) {
    try {
      const { count } = await this.client.facility.deleteMany({
        where: { id, status: "ARCHIVED" },
      });
      if (count === 1) return success(undefined);
      const exists = await this.client.facility.count({ where: { id } });
      return exists
        ? failure("CONFLICT", "Archive this facility before deleting it.")
        : failure("NOT_FOUND", "Facility not found.");
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  private async transition(
    id: string,
    from: "PUBLISHED" | "ARCHIVED",
    to: "DRAFT",
    actor: Actor,
  ) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.facility.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!row) return failure("NOT_FOUND", "Facility not found.");
        if (row.status !== from) {
          return failure(
            "CONFLICT",
            from === "PUBLISHED"
              ? "This facility is not published."
              : "This facility is not archived.",
          );
        }
        const updated = await transaction.facility.update({
          where: { id },
          data: {
            status: to,
            updatedById: actor.id,
            // A restored facility rejoins the active order at the end.
            ...(from === "ARCHIVED"
              ? { sortOrder: await nextSortOrder(transaction) }
              : {}),
          },
          include: facilityGraph,
        });
        return success(mapFacility(updated));
      });
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
            "CONFLICT",
            "The facility list changed while you were reordering. Reload and try again.",
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
          const blocked = publishabilityFailure(() =>
            assertFacilityPublishable({
              ...mapFacility(row),
              media: resolved.value,
            }),
          );
          if (blocked) return blocked;
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

  async setSocialImage(id: string, mediaId: string | null, actor: Actor) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        if (mediaId) {
          const ready = await requireReadyImage(transaction, mediaId);
          if (!ready.ok) return ready;
        }
        const updated = await transaction.facility.update({
          where: { id },
          data: { ogMediaId: mediaId, updatedById: actor.id },
          include: facilityGraph,
        });
        return success(mapFacility(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }
}
