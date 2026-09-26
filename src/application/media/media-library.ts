import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import { CACHE_TAGS } from "@/application/cache/cache-tags";
import type {
  CacheInvalidator,
  MediaStorage,
} from "@/application/ports/providers";
import type {
  MediaDetailsDto,
  MediaListItem,
  MediaListQuery,
  MediaRepository,
  MediaRightsStatus,
  MediaUsage,
  PagedResult,
} from "@/application/ports/repositories";
import { parsePageNumber } from "@/application/shared/pagination";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  mediaDetailsSchema,
} from "@/domain/media/media-asset";
import { issuesFromZod } from "@/domain/shared/domain-error";
import { MEDIA_STATUSES, type MediaStatus } from "@/domain/shared/types";

import { ingestImage, type IngestDependencies } from "./ingest-image";

export const MEDIA_PAGE_SIZE = 24;

export function parseMediaListQuery(
  params: Readonly<Record<string, unknown>>,
): MediaListQuery {
  const search =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status = (MEDIA_STATUSES as readonly unknown[]).includes(params.status)
    ? (params.status as MediaStatus)
    : null;
  return {
    search: search || null,
    status: status === "DELETED" ? null : status,
    mimeType: (ALLOWED_IMAGE_MIME_TYPES as readonly unknown[]).includes(
      params.type,
    )
      ? (params.type as string)
      : null,
    missingAlt: params.alt === "missing",
    usage:
      params.usage === "used" || params.usage === "unused"
        ? params.usage
        : null,
    rights:
      params.rights === "CONFIRMED" || params.rights === "UNCONFIRMED"
        ? params.rights
        : null,
    page: parsePageNumber(params.page),
    pageSize: MEDIA_PAGE_SIZE,
  };
}

/** The public cache tags that show an image in these places. */
export function tagsForUsage(usage: readonly MediaUsage[]) {
  const tags = new Set<string>();
  for (const item of usage) {
    if (!item.isPublic) continue;
    switch (item.kind) {
      case "ROOM":
      case "ROOM_SHARING":
        tags.add(CACHE_TAGS.rooms);
        tags.add(CACHE_TAGS.sitemap);
        if (item.slug) tags.add(CACHE_TAGS.room(item.slug));
        break;
      case "FACILITY":
      case "FACILITY_SHARING":
        tags.add(CACHE_TAGS.facilities);
        tags.add(CACHE_TAGS.sitemap);
        if (item.slug) tags.add(CACHE_TAGS.facility(item.slug));
        break;
      case "PAGE_SECTION":
      case "PAGE_SHARING":
        tags.add(CACHE_TAGS.page(item.ownerId as "HOME" | "ABOUT" | "CONTACT"));
        tags.add(CACHE_TAGS.sitemap);
        break;
      case "SITE_SETTINGS":
        tags.add(CACHE_TAGS.siteSettings);
        break;
    }
  }
  return [...tags];
}

export type UploadCommand = Readonly<{
  filename: string;
  declaredType: string;
  declaredBytes: number | null;
  source: AsyncIterable<Uint8Array>;
  /** Staff must confirm the residence may use the image. */
  rightsConfirmed: boolean;
}>;

export class MediaLibrary {
  constructor(
    private readonly deps: IngestDependencies,
    private readonly cache: CacheInvalidator,
  ) {}

  private get media(): MediaRepository {
    return this.deps.media;
  }

  private get storage(): MediaStorage {
    return this.deps.storage;
  }

  async upload(staff: StaffPrincipal | null, command: UploadCommand) {
    const access = authorize(staff, "media:upload");
    if (!access.ok) return access;
    if (!command.rightsConfirmed) {
      return failure(
        "VALIDATION",
        "Confirm that the residence may use this image.",
        { rights: ["Confirm that the residence may use this image."] },
      );
    }
    return ingestImage(this.deps, {
      ...command,
      altText: "",
      rightsStatus: "CONFIRMED",
      sourceReference: null,
      createdById: access.value.id,
    });
  }

  async list(
    staff: StaffPrincipal | null,
    params: Readonly<Record<string, unknown>>,
  ): Promise<Result<PagedResult<MediaListItem> & { query: MediaListQuery }>> {
    const access = authorize(staff, "media:upload");
    if (!access.ok) return access;
    const query = parseMediaListQuery(params);
    return success({ ...(await this.media.list(query)), query });
  }

  async details(
    staff: StaffPrincipal | null,
    id: string,
  ): Promise<Result<MediaDetailsDto | null>> {
    const access = authorize(staff, "media:upload");
    if (!access.ok) return access;
    const details = await this.media.getDetails(id);
    return success(details && details.status !== "DELETED" ? details : null);
  }

  /** Ready images for pickers. */
  async options(staff: StaffPrincipal | null) {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    return success(await this.media.listReady());
  }

  async updateDetails(
    staff: StaffPrincipal | null,
    id: string,
    values: Readonly<Record<string, unknown>>,
  ) {
    const access = authorize(staff, "media:upload");
    if (!access.ok) return access;
    const parsed = mediaDetailsSchema.safeParse(values);
    if (!parsed.success) {
      return invalid(
        "Some image details need attention.",
        issuesFromZod(parsed.error.issues),
      );
    }
    const before = await this.media.getDetails(id);
    if (!before || before.status === "DELETED") {
      return failure("NOT_FOUND", "This image no longer exists.");
    }
    const result = await this.media.updateDetails(
      id,
      parsed.data,
      access.value,
    );
    if (result.ok) await this.invalidate(before.usage);
    return result;
  }

  /** Administrators confirm or withdraw usage rights. */
  async setRights(
    staff: StaffPrincipal | null,
    id: string,
    status: MediaRightsStatus,
  ) {
    const access = authorize(staff, "media:rights");
    if (!access.ok) return access;
    const before = await this.media.getDetails(id);
    if (!before || before.status === "DELETED") {
      return failure("NOT_FOUND", "This image no longer exists.");
    }
    if (
      status === "UNCONFIRMED" &&
      before.usage.some((item) => item.isPublic)
    ) {
      return failure(
        "NOT_PUBLISHABLE",
        "This image appears on published content. Replace it there before withdrawing its rights.",
      );
    }
    return this.media.setRightsStatus(id, status, access.value);
  }

  /** Points every use of `fromId` at `toId`. The old image stays in the library. */
  async replace(staff: StaffPrincipal | null, fromId: string, toId: string) {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    const before = await this.media.getDetails(fromId);
    if (!before) return failure("NOT_FOUND", "This image no longer exists.");
    const result = await this.media.replaceReferences(
      fromId,
      toId,
      access.value,
    );
    if (result.ok) await this.invalidate(before.usage);
    return result;
  }

  /**
   * Administrators delete unused images. The record is marked DELETED first
   * (so it is never served again), then the object is removed; if removal
   * fails, cleanup retries it later.
   */
  async delete(
    staff: StaffPrincipal | null,
    id: string,
  ): Promise<Result<void>> {
    const access = authorize(staff, "media:delete");
    if (!access.ok) return access;
    const marked = await this.media.markDeleted(id, access.value);
    if (!marked.ok) return marked;
    try {
      await this.storage.delete(marked.value.storageKey);
      await this.media.purge(id);
    } catch {
      // Left as DELETED for the cleanup job; nothing public is affected.
    }
    return success(undefined);
  }

  private async invalidate(usage: readonly MediaUsage[]) {
    const tags = tagsForUsage(usage);
    if (tags.length > 0) await this.cache.invalidate(tags);
  }
}
