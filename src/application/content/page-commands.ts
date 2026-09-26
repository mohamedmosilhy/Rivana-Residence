import { z } from "zod";

import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import { CACHE_TAGS } from "@/application/cache/cache-tags";
import type { CacheInvalidator } from "@/application/ports/providers";
import type { PageDto, PageRepository } from "@/application/ports/repositories";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import {
  PAGE_KEYS,
  assertPagePublishable,
  isSectionLocked,
  type PageKey,
  type PageSectionType,
} from "@/domain/content/page-sections";
import { seoFields } from "@/domain/shared/content-fields";
import { issuesFromZod } from "@/domain/shared/domain-error";
import { richTextFromEditorText } from "@/domain/shared/rich-text";

import { optionalMediaId, sectionMediaFromForm } from "./catalog-forms";
import { readinessIssues } from "./catalog-queries";
import {
  checkbox,
  jsonValue,
  optionalString,
  type FormValues,
} from "./form-values";

/** Maps a URL segment such as "home" to a page key. */
export function pageKeyFromSegment(segment: string): PageKey | null {
  const key = segment.toUpperCase();
  return (PAGE_KEYS as readonly string[]).includes(key)
    ? (key as PageKey)
    : null;
}

export type PageSummary = Readonly<{
  key: PageKey;
  title: string;
  canonicalPath: string;
  isPublished: boolean;
  updatedAt: Date;
  readiness: readonly string[];
}>;

export type PageEditorView = Readonly<{
  page: PageDto;
  readiness: readonly string[];
  lockedTypes: readonly PageSectionType[];
}>;

function pageReadiness(page: PageDto) {
  return readinessIssues(() => assertPagePublishable(page.key, page.sections));
}

// The editor submits rich-text fields in the plain-text editor format and
// numbers as strings. This normalizes them; the domain schema then decides
// validity. `schemaVersion` is always set by the server.
export function sectionPayloadFromForm(
  type: PageSectionType,
  raw: unknown,
): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const text = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : "";
  const cta = () => {
    const link = value.cta as Record<string, unknown> | undefined;
    const label = typeof link?.label === "string" ? link.label.trim() : "";
    return label ? { cta: { label, intent: link?.intent } } : {};
  };

  switch (type) {
    case "HERO":
      return {
        schemaVersion: 1,
        title: text("title"),
        summary: text("summary"),
        ...cta(),
      };
    case "RICH_TEXT":
      return {
        schemaVersion: 1,
        document: richTextFromEditorText(text("documentText")),
      };
    case "IMAGE_TEXT_SPLIT":
      return {
        schemaVersion: 1,
        body: richTextFromEditorText(text("bodyText")),
        imageSide: value.imageSide,
        ...cta(),
      };
    case "GALLERY":
      return { schemaVersion: 1, layout: value.layout };
    case "ROOM_GRID":
    case "FACILITY_GRID":
      return {
        schemaVersion: 1,
        limit: text("limit").trim() === "" ? undefined : Number(value.limit),
        featuredOnly: value.featuredOnly === true,
      };
    case "CONTACT_CTA":
      return {
        schemaVersion: 1,
        body: text("body"),
        formEnabled: value.formEnabled === true,
      };
    case "FEATURE_GRID":
    case "STATS":
      return { schemaVersion: 1, items: value.items };
  }
}

const detailsSchema = z.object({
  ...seoFields,
  ogMediaId: z.string().nullable(),
});

export class PageCommands {
  constructor(
    private readonly pages: PageRepository,
    private readonly cache: CacheInvalidator,
  ) {}

  async list(
    staff: StaffPrincipal | null,
  ): Promise<Result<readonly PageSummary[]>> {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    const pages = await Promise.all(
      PAGE_KEYS.map((key) => this.pages.findAdminByKey(key)),
    );
    return success(
      pages.flatMap((page) =>
        page
          ? [
              {
                key: page.key,
                title: page.title,
                canonicalPath: page.canonicalPath,
                isPublished: page.isPublished,
                updatedAt: page.updatedAt,
                readiness: pageReadiness(page),
              },
            ]
          : [],
      ),
    );
  }

  async get(
    staff: StaffPrincipal | null,
    key: PageKey,
  ): Promise<Result<PageEditorView | null>> {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    const page = await this.pages.findAdminByKey(key);
    if (!page) return success(null);
    return success({
      page,
      readiness: pageReadiness(page),
      lockedTypes: page.sections
        .map((section) => section.type)
        .filter((type) => isSectionLocked(key, type)),
    });
  }

  async saveSection(
    staff: StaffPrincipal | null,
    key: PageKey,
    sectionId: string,
    values: FormValues,
  ): Promise<Result<PageDto>> {
    return this.edit(staff, "content:edit", key, async (actor, page) => {
      const section = page.sections.find((item) => item.id === sectionId);
      if (!section) {
        return failure("NOT_FOUND", "This section no longer exists.");
      }
      return this.pages.saveSection(
        key,
        {
          id: section.id,
          type: section.type,
          heading: optionalString(values, "heading"),
          eyebrow: optionalString(values, "eyebrow"),
          isVisible: checkbox(values, "isVisible"),
          payload: sectionPayloadFromForm(
            section.type,
            jsonValue(values, "payload"),
          ),
        },
        actor,
      );
    });
  }

  async updateDetails(
    staff: StaffPrincipal | null,
    key: PageKey,
    values: FormValues,
  ): Promise<Result<PageDto>> {
    return this.edit(staff, "content:edit", key, (actor) => {
      const parsed = detailsSchema.safeParse({
        seoTitle: optionalString(values, "seoTitle"),
        seoDescription: optionalString(values, "seoDescription"),
        ogMediaId: optionalMediaId(values, "ogMediaId"),
      });
      if (!parsed.success) {
        return Promise.resolve(
          invalid(
            "Some details need attention.",
            issuesFromZod(parsed.error.issues),
          ),
        );
      }
      return this.pages.updateDetails(key, parsed.data, actor);
    });
  }

  async saveSectionMedia(
    staff: StaffPrincipal | null,
    key: PageKey,
    sectionId: string,
    values: FormValues,
  ): Promise<Result<PageDto>> {
    return this.edit(staff, "content:edit", key, async (actor) => {
      const media = sectionMediaFromForm(values);
      if (!media.ok) return media;
      return this.pages.replaceSectionMedia(key, sectionId, media.value, actor);
    });
  }

  async moveSection(
    staff: StaffPrincipal | null,
    key: PageKey,
    sectionId: string,
    offset: -1 | 1,
  ): Promise<Result<void>> {
    return this.edit(staff, "content:edit", key, async (actor, page) => {
      const order = page.sections.map((section) => section.id);
      const index = order.indexOf(sectionId);
      const target = index + offset;
      if (index < 0)
        return failure("NOT_FOUND", "This section no longer exists.");
      if (target < 0 || target >= order.length) return success(undefined);
      [order[index], order[target]] = [order[target]!, order[index]!];
      return this.pages.reorderSections(page.id, order, actor);
    });
  }

  async publish(staff: StaffPrincipal | null, key: PageKey) {
    return this.release(staff, key, (actor) => this.pages.publish(key, actor));
  }

  async unpublish(staff: StaffPrincipal | null, key: PageKey) {
    return this.release(staff, key, (actor) =>
      this.pages.unpublish(key, actor),
    );
  }

  /** Content edits: invalidate the page only while it is public. */
  private async edit<T>(
    staff: StaffPrincipal | null,
    capability: "content:edit",
    key: PageKey,
    operation: (actor: StaffPrincipal, page: PageDto) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    const access = authorize(staff, capability);
    if (!access.ok) return access;
    const page = await this.pages.findAdminByKey(key);
    if (!page) return failure("NOT_FOUND", "Page not found.");
    const result = await operation(access.value, page);
    if (result.ok && page.isPublished) {
      await this.cache.invalidate([CACHE_TAGS.page(key), CACHE_TAGS.sitemap]);
    }
    return result;
  }

  /** Publication changes the page and the sitemap. */
  private async release(
    staff: StaffPrincipal | null,
    key: PageKey,
    operation: (actor: StaffPrincipal) => Promise<Result<PageDto>>,
  ) {
    const access = authorize(staff, "content:publish");
    if (!access.ok) return access;
    const result = await operation(access.value);
    if (result.ok) {
      await this.cache.invalidate([CACHE_TAGS.page(key), CACHE_TAGS.sitemap]);
    }
    return result;
  }
}
