import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  Actor,
  PageDetailsInput,
  PageRepository,
  PageSectionInput,
  SectionMediaAssignment,
} from "@/application/ports/repositories";
import { SECTION_MEDIA_SLOTS } from "@/domain/media/media-asset";
import {
  failure,
  invalid,
  notPublishable,
  success,
} from "@/application/shared/result";
import {
  assertPagePublishable,
  assertSectionOrder,
  assertSectionVisibilityAllowed,
  pageSectionMetaSchema,
  parsePageSectionPayload,
  type PageKey,
} from "@/domain/content/page-sections";
import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import {
  mapPage,
  pageGraph,
  sectionMediaInclude,
} from "@/infrastructure/db/prisma/mappers/content-mappers";
import { requireReadyImage } from "@/infrastructure/db/prisma/media-assignments";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";
import { isCompleteOrder } from "@/infrastructure/db/prisma/ordering";
import {
  RollbackWith,
  publishabilityFailure,
} from "@/infrastructure/db/prisma/publication-guard";

export class PrismaPageRepository implements PageRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async findPublishedByKey(key: PageKey) {
    const row = await this.client.page.findFirst({
      where: { key, isPublished: true },
      include: {
        sections: {
          where: { isVisible: true },
          orderBy: { sortOrder: "asc" },
          include: sectionMediaInclude,
        },
      },
    });
    return row ? mapPage(row) : null;
  }

  async findAdminByKey(key: PageKey) {
    const row = await this.client.page.findUnique({
      where: { key },
      include: pageGraph,
    });
    return row ? mapPage(row) : null;
  }

  async publish(key: PageKey, actor: Actor) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const row = await transaction.page.findUnique({
          where: { key },
          include: pageGraph,
        });
        if (!row) return failure("NOT_FOUND", "Page not found.");

        try {
          assertPagePublishable(key, mapPage(row).sections);
        } catch (error) {
          if (error instanceof DomainValidationError) {
            return notPublishable(error);
          }
          throw error;
        }

        const updated = await transaction.page.update({
          where: { key },
          data: { isPublished: true, updatedById: actor.id },
          include: pageGraph,
        });
        return success(mapPage(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async unpublish(key: PageKey, actor: Actor) {
    try {
      const row = await this.client.page.update({
        where: { key },
        data: { isPublished: false, updatedById: actor.id },
        include: pageGraph,
      });
      return success(mapPage(row));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async updateDetails(key: PageKey, input: PageDetailsInput, actor: Actor) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        if (input.ogMediaId) {
          const ready = await requireReadyImage(transaction, input.ogMediaId);
          if (!ready.ok) return ready;
        }
        const row = await transaction.page.update({
          where: { key },
          data: {
            seoTitle: input.seoTitle,
            seoDescription: input.seoDescription,
            ogMediaId: input.ogMediaId,
            updatedById: actor.id,
          },
          include: pageGraph,
        });
        return success(mapPage(row));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async replaceSectionMedia(
    key: PageKey,
    sectionId: string,
    media: readonly SectionMediaAssignment[],
    actor: Actor,
  ) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const page = await transaction.page.findUnique({
          where: { key },
          include: pageGraph,
        });
        if (!page) return failure("NOT_FOUND", "Page not found.");
        const section = page.sections.find((item) => item.id === sectionId);
        if (!section) {
          return failure("NOT_FOUND", "Section not found on this page.");
        }

        const slots = SECTION_MEDIA_SLOTS[section.type] ?? [];
        for (const slot of slots) {
          const count = media.filter((item) => item.role === slot.role).length;
          if (!slot.multiple && count > 1) {
            return failure(
              "VALIDATION",
              `Choose one ${slot.label.toLowerCase()}.`,
            );
          }
        }
        if (
          media.some((item) => !slots.some((slot) => slot.role === item.role))
        ) {
          return failure("VALIDATION", "This section cannot hold that image.");
        }
        const positions = new Set(
          media.map((item) => `${item.role}:${item.sortOrder}`),
        );
        if (positions.size !== media.length) {
          return failure("VALIDATION", "Each image position may be used once.");
        }
        const ids = [...new Set(media.map((item) => item.mediaId))];
        const ready = await transaction.mediaAsset.count({
          where: { id: { in: ids }, status: "READY" },
        });
        if (ready !== ids.length) {
          return failure(
            "VALIDATION",
            "Choose images that have finished uploading.",
          );
        }

        await transaction.pageSectionMedia.deleteMany({ where: { sectionId } });
        if (media.length > 0) {
          await transaction.pageSectionMedia.createMany({
            data: media.map((item) => ({ sectionId, ...item })),
          });
        }
        const updated = await transaction.page.update({
          where: { id: page.id },
          data: { updatedById: actor.id },
          include: pageGraph,
        });
        if (updated.isPublished) {
          // A published page must stay publishable; roll back if not.
          const blocked = publishabilityFailure(() =>
            assertPagePublishable(key, mapPage(updated).sections),
          );
          if (blocked) throw new RollbackWith(blocked);
        }
        return success(mapPage(updated));
      });
    } catch (error) {
      if (error instanceof RollbackWith) return error.result;
      return translatePrismaWriteError(error);
    }
  }

  async saveSection(key: PageKey, section: PageSectionInput, actor: Actor) {
    const meta = pageSectionMetaSchema.safeParse(section);
    if (!meta.success) {
      return invalid("Section is invalid.", issuesFromZod(meta.error.issues));
    }
    let payload: unknown;
    try {
      assertSectionVisibilityAllowed(key, section.type, section.isVisible);
      payload = parsePageSectionPayload(key, section.type, section.payload);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return invalid(error.message, error.issues);
      }
      throw error;
    }

    try {
      return await withTransaction(this.client, async (transaction) => {
        const page = await transaction.page.findUnique({
          where: { key },
          include: pageGraph,
        });
        if (!page) return failure("NOT_FOUND", "Page not found.");
        const existing = section.id
          ? page.sections.find((candidate) => candidate.id === section.id)
          : undefined;
        if (section.id && !existing) {
          return failure("NOT_FOUND", "Section not found on this page.");
        }
        if (existing && existing.type !== section.type) {
          return failure("VALIDATION", "A section's type cannot change.");
        }

        if (page.isPublished) {
          const current = mapPage(page).sections;
          const draft = {
            type: section.type,
            payload,
            isVisible: section.isVisible,
            media:
              current.find((item) => item.id === existing?.id)?.media ?? [],
          };
          const sections = existing
            ? current.map((candidate) =>
                candidate.id === existing.id ? draft : candidate,
              )
            : [...current, draft];
          try {
            assertPagePublishable(key, sections);
          } catch (error) {
            if (error instanceof DomainValidationError) {
              return notPublishable(error);
            }
            throw error;
          }
        }

        const data = {
          type: section.type,
          heading: meta.data.heading,
          eyebrow: meta.data.eyebrow,
          payload: payload as Prisma.InputJsonObject,
          isVisible: section.isVisible,
        };
        if (existing) {
          await transaction.pageSection.update({
            where: { id: existing.id },
            data,
          });
        } else {
          const lastOrder = page.sections.at(-1)?.sortOrder ?? -1;
          await transaction.pageSection.create({
            data: {
              ...data,
              id: createId(),
              pageId: page.id,
              sortOrder: lastOrder + 1,
            },
          });
        }

        const updated = await transaction.page.update({
          where: { id: page.id },
          data: { updatedById: actor.id },
          include: pageGraph,
        });
        return success(mapPage(updated));
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async reorderSections(
    pageId: string,
    orderedIds: readonly string[],
    actor: Actor,
  ) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const page = await transaction.page.findUnique({
          where: { id: pageId },
          select: { key: true },
        });
        if (!page) return failure("NOT_FOUND", "Page not found.");
        const sections = await transaction.pageSection.findMany({
          where: { pageId },
          select: { id: true, type: true },
        });
        if (!isCompleteOrder(orderedIds, sections)) {
          return failure(
            "VALIDATION",
            "Section order must contain every page section exactly once.",
          );
        }
        const typeOf = new Map(sections.map((row) => [row.id, row.type]));
        const blocked = publishabilityFailure(() =>
          assertSectionOrder(
            page.key,
            orderedIds.map((id) => typeOf.get(id)!),
          ),
        );
        if (blocked && !blocked.ok) {
          return failure(
            "VALIDATION",
            blocked.error.message,
            blocked.error.fieldErrors,
          );
        }
        for (const [index, id] of orderedIds.entries()) {
          await transaction.pageSection.update({
            where: { id },
            data: { sortOrder: -(index + 1) },
          });
        }
        for (const [index, id] of orderedIds.entries()) {
          await transaction.pageSection.update({
            where: { id },
            data: { sortOrder: index },
          });
        }
        await transaction.page.update({
          where: { id: pageId },
          data: { updatedById: actor.id },
        });
        return success(undefined);
      });
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }
}
