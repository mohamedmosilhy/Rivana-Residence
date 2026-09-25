import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  Actor,
  RoomRepository,
  MediaAssignment,
  RoomInput,
} from "@/application/ports/repositories";
import {
  failure,
  invalid,
  notPublishable,
  success,
} from "@/application/shared/result";
import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";
import { assertRoomPublishable, roomDraftSchema } from "@/domain/rooms/room";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import {
  mapRoom,
  roomGraph,
} from "@/infrastructure/db/prisma/mappers/content-mappers";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";
import { resolveMediaAssignments } from "@/infrastructure/db/prisma/media-assignments";
import { isCompleteOrder } from "@/infrastructure/db/prisma/ordering";

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
    const parsed = roomDraftSchema.safeParse(input);
    if (!parsed.success) {
      return invalid("Room is invalid.", issuesFromZod(parsed.error.issues));
    }
    try {
      return await withTransaction(this.client, async (transaction) => {
        const last = await transaction.room.aggregate({
          where: { status: { not: "ARCHIVED" } },
          _max: { sortOrder: true },
        });
        const row = await transaction.room.create({
          data: {
            ...parsed.data,
            id: createId(),
            description: parsed.data.description as Prisma.InputJsonObject,
            featured: input.featured,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
            status: "DRAFT",
            updatedById: actor.id,
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
    const parsed = roomDraftSchema.safeParse(input);
    if (!parsed.success) {
      return invalid("Room is invalid.", issuesFromZod(parsed.error.issues));
    }
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.room.findUnique({
          where: { id },
          include: roomGraph,
        });
        if (!row) return failure("NOT_FOUND", "Room not found.");

        if (row.status === "PUBLISHED") {
          try {
            assertRoomPublishable({ ...mapRoom(row), ...parsed.data });
          } catch (error) {
            if (error instanceof DomainValidationError) {
              return notPublishable(error);
            }
            throw error;
          }
        }

        const updated = await transaction.room.update({
          where: { id },
          data: {
            ...parsed.data,
            description: parsed.data.description as Prisma.InputJsonObject,
            featured: input.featured,
            updatedById: actor.id,
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

        const candidate = mapRoom(row);
        try {
          assertRoomPublishable(candidate);
        } catch (error) {
          if (error instanceof DomainValidationError) {
            return notPublishable(error);
          }
          throw error;
        }

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

  async reorder(orderedIds: readonly string[], actor: Actor) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const active = await transaction.room.findMany({
          where: { status: { not: "ARCHIVED" } },
          select: { id: true },
        });
        if (!isCompleteOrder(orderedIds, active)) {
          return failure(
            "VALIDATION",
            "Room order must contain every active room exactly once.",
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
          try {
            assertRoomPublishable({ ...mapRoom(row), media: resolved.value });
          } catch (error) {
            if (error instanceof DomainValidationError) {
              return notPublishable(error);
            }
            throw error;
          }
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
