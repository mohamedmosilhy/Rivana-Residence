import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  Actor,
  MediaAssignment,
  RoomInput,
  RoomRepository,
} from "@/application/ports/repositories";
import { failure, invalid, success } from "@/application/shared/result";
import { issuesFromZod } from "@/domain/shared/domain-error";
import { assertRoomPublishable, roomDraftSchema } from "@/domain/rooms/room";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import {
  mapRoom,
  roomGraph,
} from "@/infrastructure/db/prisma/mappers/content-mappers";
import { resolveMediaAssignments } from "@/infrastructure/db/prisma/media-assignments";
import { isCompleteOrder } from "@/infrastructure/db/prisma/ordering";
import { publishabilityFailure } from "@/infrastructure/db/prisma/publication-guard";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";

function parse(input: RoomInput) {
  const parsed = roomDraftSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : invalid("Room is invalid.", issuesFromZod(parsed.error.issues));
}

async function nextSortOrder(transaction: Prisma.TransactionClient) {
  const last = await transaction.room.aggregate({
    where: { status: { not: "ARCHIVED" } },
    _max: { sortOrder: true },
  });
  return (last._max.sortOrder ?? -1) + 1;
}

export class PrismaRoomRepository implements RoomRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async listPublished() {
    const rows = await this.client.room.findMany({
      where: { status: "PUBLISHED" },
      include: roomGraph,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return rows.map(mapRoom);
  }

  async findPublishedBySlug(slug: string) {
    const row = await this.client.room.findFirst({
      where: { slug, status: "PUBLISHED" },
      include: roomGraph,
    });
    return row ? mapRoom(row) : null;
  }

  async findAdminById(id: string) {
    const row = await this.client.room.findUnique({
      where: { id },
      include: roomGraph,
    });
    return row ? mapRoom(row) : null;
  }

  async listAdmin() {
    const rows = await this.client.room.findMany({
      include: roomGraph,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return rows.map(mapRoom);
  }

  async create(input: RoomInput, actor: Actor) {
    const parsed = parse(input);
    if (!parsed.ok) return parsed;
    const { features, ...fields } = parsed.value;
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.room.create({
          data: {
            ...fields,
            id: createId(),
            description: fields.description as Prisma.InputJsonObject,
            featured: input.featured,
            sortOrder: await nextSortOrder(transaction),
            status: "DRAFT",
            updatedById: actor.id,
            features: {
              create: features.map((feature, index) => ({
                id: createId(),
                label: feature.label,
                sortOrder: index,
              })),
            },
          },
          include: roomGraph,
        });
        return success(mapRoom(row));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async update(id: string, input: RoomInput, actor: Actor) {
    const parsed = parse(input);
    if (!parsed.ok) return parsed;
    const { features, ...fields } = parsed.value;
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.room.findUnique({
          where: { id },
          include: roomGraph,
        });
        if (!row) return failure("NOT_FOUND", "Room not found.");

        if (row.status === "PUBLISHED") {
          const blocked = publishabilityFailure(() =>
            assertRoomPublishable({ ...mapRoom(row), ...parsed.value }),
          );
          if (blocked) return blocked;
        }

        await transaction.roomFeature.deleteMany({ where: { roomId: id } });
        const updated = await transaction.room.update({
          where: { id },
          data: {
            ...fields,
            description: fields.description as Prisma.InputJsonObject,
            featured: input.featured,
            updatedById: actor.id,
            features: {
              create: features.map((feature, index) => ({
                id: createId(),
                label: feature.label,
                sortOrder: index,
              })),
            },
          },
          include: roomGraph,
        });
        return success(mapRoom(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async publish(id: string, actor: Actor) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.room.findUnique({
          where: { id },
          include: roomGraph,
        });
        if (!row) return failure("NOT_FOUND", "Room not found.");
        if (row.status === "ARCHIVED") {
          return failure("CONFLICT", "Restore this room before publishing.");
        }

        const blocked = publishabilityFailure(() =>
          assertRoomPublishable(mapRoom(row)),
        );
        if (blocked) return blocked;

        const updated = await transaction.room.update({
          where: { id },
          data: { status: "PUBLISHED", updatedById: actor.id },
          include: roomGraph,
        });
        return success(mapRoom(updated));
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
      await this.client.room.update({
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
      const { count } = await this.client.room.deleteMany({
        where: { id, status: "ARCHIVED" },
      });
      if (count === 1) return success(undefined);
      const exists = await this.client.room.count({ where: { id } });
      return exists
        ? failure("CONFLICT", "Archive this room before deleting it.")
        : failure("NOT_FOUND", "Room not found.");
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
        const row = await transaction.room.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!row) return failure("NOT_FOUND", "Room not found.");
        if (row.status !== from) {
          return failure(
            "CONFLICT",
            from === "PUBLISHED"
              ? "This room is not published."
              : "This room is not archived.",
          );
        }
        const updated = await transaction.room.update({
          where: { id },
          data: {
            status: to,
            updatedById: actor.id,
            // A restored room rejoins the active order at the end.
            ...(from === "ARCHIVED"
              ? { sortOrder: await nextSortOrder(transaction) }
              : {}),
          },
          include: roomGraph,
        });
        return success(mapRoom(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async reorder(orderedIds: readonly string[], actor: Actor) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const active = await transaction.room.findMany({
          where: { status: { not: "ARCHIVED" } },
          select: { id: true },
        });
        if (!isCompleteOrder(orderedIds, active)) {
          return failure(
            "CONFLICT",
            "The room list changed while you were reordering. Reload and try again.",
          );
        }

        for (const [index, id] of orderedIds.entries()) {
          await transaction.room.update({
            where: { id },
            data: { sortOrder: -(index + 1), updatedById: actor.id },
          });
        }
        for (const [index, id] of orderedIds.entries()) {
          await transaction.room.update({
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
        const row = await transaction.room.findUnique({
          where: { id },
          include: roomGraph,
        });
        if (!row) return failure("NOT_FOUND", "Room not found.");

        const resolved = await resolveMediaAssignments(transaction, media);
        if (!resolved.ok) return resolved;

        if (row.status === "PUBLISHED") {
          const blocked = publishabilityFailure(() =>
            assertRoomPublishable({ ...mapRoom(row), media: resolved.value }),
          );
          if (blocked) return blocked;
        }

        await transaction.roomMedia.deleteMany({ where: { roomId: id } });
        await transaction.roomMedia.createMany({
          data: media.map((assignment) => ({ roomId: id, ...assignment })),
        });
        const updated = await transaction.room.update({
          where: { id },
          data: { updatedById: actor.id },
          include: roomGraph,
        });
        return success(mapRoom(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }
}
