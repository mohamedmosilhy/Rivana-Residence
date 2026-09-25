import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  Actor,
  PromotionRepository,
  PromotionInput,
} from "@/application/ports/repositories";
import { failure, invalid, success } from "@/application/shared/result";
import {
  nextPromotionVersion,
  promotionDraftSchema,
} from "@/domain/promotions/promotion";
import { issuesFromZod } from "@/domain/shared/domain-error";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import { mapPromotion } from "@/infrastructure/db/prisma/mappers/content-mappers";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";

export class PrismaPromotionRepository implements PromotionRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async getCurrent(now: Date) {
    const row = await this.client.promotion.findFirst({
      where: {
        status: "PUBLISHED",
        showAsPopup: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ priority: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
    });
    return row ? mapPromotion(row) : null;
  }

  async listAdmin() {
    const rows = await this.client.promotion.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    return rows.map(mapPromotion);
  }

  async findAdminById(id: string) {
    const row = await this.client.promotion.findUnique({ where: { id } });
    return row ? mapPromotion(row) : null;
  }

  async create(input: PromotionInput, actor: Actor) {
    const parsed = promotionDraftSchema.safeParse(input);
    if (!parsed.success) {
      return invalid(
        "Promotion is invalid.",
        issuesFromZod(parsed.error.issues),
      );
    }
    try {
      const row = await this.client.promotion.create({
        data: {
          ...parsed.data,
          id: createId(),
          status: "DRAFT",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      return success(mapPromotion(row));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async update(id: string, input: PromotionInput, actor: Actor) {
    const parsed = promotionDraftSchema.safeParse(input);
    if (!parsed.success) {
      return invalid(
        "Promotion is invalid.",
        issuesFromZod(parsed.error.issues),
      );
    }
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.promotion.findUnique({ where: { id } });
        if (!row) return failure("NOT_FOUND", "Promotion not found.");

        const publicContent = (value: PromotionInput) => ({
          headline: value.headline,
          body: value.body,
          code: value.code,
          terms: value.terms,
          showAsPopup: value.showAsPopup,
        });
        const updated = await transaction.promotion.update({
          where: { id },
          data: {
            ...parsed.data,
            version: nextPromotionVersion(
              row.version,
              publicContent(row),
              publicContent(parsed.data),
            ),
            updatedById: actor.id,
          },
        });
        return success(mapPromotion(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async publish(id: string, actor: Actor, now: Date) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.promotion.findUnique({ where: { id } });
        if (!row) return failure("NOT_FOUND", "Promotion not found.");
        if (row.status === "ARCHIVED") {
          return failure(
            "CONFLICT",
            "Restore this promotion before publishing.",
          );
        }
        const validation = promotionDraftSchema.safeParse(row);
        if (!validation.success) {
          return failure("NOT_PUBLISHABLE", "Promotion is not publishable.", {
            promotion: validation.error.issues.map((issue) => issue.message),
          });
        }
        const updated = await transaction.promotion.update({
          where: { id },
          data: {
            status: "PUBLISHED",
            publishedAt: now,
            updatedById: actor.id,
          },
        });
        return success(mapPromotion(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async archive(id: string, actor: Actor) {
    try {
      await this.client.promotion.update({
        where: { id },
        data: { status: "ARCHIVED", updatedById: actor.id },
      });
      return success(undefined);
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  unpublish(id: string, actor: Actor) {
    return this.transition(id, "PUBLISHED", actor);
  }

  restore(id: string, actor: Actor) {
    return this.transition(id, "ARCHIVED", actor);
  }

  async delete(id: string) {
    try {
      const { count } = await this.client.promotion.deleteMany({
        where: { id, status: "ARCHIVED" },
      });
      if (count === 1) return success(undefined);
      const exists = await this.client.promotion.count({ where: { id } });
      return exists
        ? failure("CONFLICT", "Archive this promotion before deleting it.")
        : failure("NOT_FOUND", "Promotion not found.");
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  /** Moves a promotion from `from` back to DRAFT. */
  private async transition(
    id: string,
    from: "PUBLISHED" | "ARCHIVED",
    actor: Actor,
  ) {
    try {
      const { count } = await this.client.promotion.updateMany({
        where: { id, status: from },
        data: { status: "DRAFT", updatedById: actor.id },
      });
      const row = await this.client.promotion.findUnique({ where: { id } });
      if (!row) return failure("NOT_FOUND", "Promotion not found.");
      if (count === 0) {
        return failure(
          "CONFLICT",
          from === "PUBLISHED"
            ? "This promotion is not published."
            : "This promotion is not archived.",
        );
      }
      return success(mapPromotion(row));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }
}
