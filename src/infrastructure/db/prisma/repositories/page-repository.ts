import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  Actor,
  PageDetailsInput,
  PageRepository,
  PageSectionInput,
} from "@/application/ports/repositories";
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
} from "@/infrastructure/db/prisma/mappers/content-mappers";
import {
  type DatabaseClient,
  withTransaction,
} from "@/infrastructure/db/prisma/transaction";
import { isCompleteOrder } from "@/infrastructure/db/prisma/ordering";
import { publishabilityFailure } from "@/infrastructure/db/prisma/publication-guard";

export class PrismaPageRepository implements PageRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async findPublishedByKey(key: PageKey) {
    const row = await this.client.page.findFirst({
      where: { key, isPublished: true },
      include: {
        sections: {
          where: { isVisible: true },
          orderBy: { sortOrder: "asc" },
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
          assertPagePublishable(
            key,
            row.sections.map((section) => ({
              type: section.type,
              payload: section.payload,
              isVisible: section.isVisible,
            })),
          );
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
      const row = await this.client.page.update({
        where: { key },
        data: {
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          updatedById: actor.id,
        },
        include: pageGraph,
      });
      return success(mapPage(row));
    } catch (error) {
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
          const draft = {
            type: section.type,
            payload,
            isVisible: section.isVisible,
          };
          const sections = existing
            ? page.sections.map((candidate) =>
                candidate.id === existing.id ? draft : candidate,
              )
            : [...page.sections, draft];
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
