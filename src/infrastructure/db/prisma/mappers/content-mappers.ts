import "server-only";

import type {
  FacilityDto,
  PageDto,
  RoomDto,
} from "@/application/content/ports";
import type { ContactEnquiryDto } from "@/application/enquiries/ports";
import type { MediaAssetDto } from "@/application/media/ports";
import type { SiteSettingsDto } from "@/application/settings/ports";
import {
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/domain/settings/site-settings";
import type { RichTextDocument } from "@/domain/shared/types";
import { Prisma } from "@/generated/prisma/client";

export const roomGraph = {
  features: { orderBy: { sortOrder: "asc" } },
  media: {
    include: { media: true },
    orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
  },
} satisfies Prisma.RoomInclude;

export const facilityGraph = {
  media: {
    include: { media: true },
    orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
  },
} satisfies Prisma.FacilityInclude;

export const sectionMediaInclude = {
  media: {
    include: { media: true },
    orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
  },
} satisfies Prisma.PageSectionInclude;

export const pageGraph = {
  sections: {
    orderBy: { sortOrder: "asc" },
    include: sectionMediaInclude,
  },
} satisfies Prisma.PageInclude;

type MediaRow = Prisma.MediaAssetGetPayload<object>;

/** A usage join row plus its asset, as a provider-neutral reference. */
function mediaReference<Role extends string>(usage: {
  role: Role;
  sortOrder: number;
  altOverride: string | null;
  media: Pick<
    MediaRow,
    | "id"
    | "status"
    | "altText"
    | "storageKey"
    | "rightsStatus"
    | "width"
    | "height"
    | "focalX"
    | "focalY"
  >;
}) {
  return {
    id: usage.media.id,
    role: usage.role,
    sortOrder: usage.sortOrder,
    status: usage.media.status,
    altText: usage.media.altText,
    altOverride: usage.altOverride,
    storageKey: usage.media.storageKey,
    rightsConfirmed: usage.media.rightsStatus === "CONFIRMED",
    width: usage.media.width,
    height: usage.media.height,
    focalX: usage.media.focalX === null ? null : usage.media.focalX.toNumber(),
    focalY: usage.media.focalY === null ? null : usage.media.focalY.toNumber(),
  };
}

type RoomRow = Prisma.RoomGetPayload<{ include: typeof roomGraph }>;
type FacilityRow = Prisma.FacilityGetPayload<{
  include: typeof facilityGraph;
}>;
type PageRow = Prisma.PageGetPayload<{ include: typeof pageGraph }>;

function richText(value: Prisma.JsonValue) {
  return value as unknown as RichTextDocument;
}

export function mapRoom(row: RoomRow): RoomDto {
  return {
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    slug: row.slug,
    accommodationType: row.accommodationType,
    bedroomCount: row.bedroomCount,
    bathroomCount: row.bathroomCount,
    shortDescription: row.shortDescription,
    description: richText(row.description),
    sizeSqm: row.sizeSqm ? Number(row.sizeSqm) : null,
    maxAdults: row.maxAdults,
    maxChildren: row.maxChildren,
    bedSummary: row.bedSummary,
    viewSummary: row.viewSummary,
    features: row.features.map((feature) => ({ label: feature.label })),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    ogMediaId: row.ogMediaId,
    featured: row.featured,
    sortOrder: row.sortOrder,
    status: row.status,
    updatedAt: row.updatedAt,
    media: row.media.map(mediaReference),
  };
}

export function mapFacility(row: FacilityRow): FacilityDto {
  return {
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    slug: row.slug,
    shortDescription: row.shortDescription,
    description: richText(row.description),
    openingHoursText: row.openingHoursText,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    ogMediaId: row.ogMediaId,
    featured: row.featured,
    sortOrder: row.sortOrder,
    status: row.status,
    updatedAt: row.updatedAt,
    media: row.media.map(mediaReference),
  };
}

export function mapPage(row: PageRow): PageDto {
  return {
    id: row.id,
    branchId: row.branchId,
    key: row.key,
    title: row.title,
    canonicalPath: row.canonicalPath,
    isPublished: row.isPublished,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    ogMediaId: row.ogMediaId,
    updatedAt: row.updatedAt,
    sections: row.sections.map((section) => ({
      id: section.id,
      type: section.type,
      heading: section.heading,
      eyebrow: section.eyebrow,
      payload: section.payload,
      sortOrder: section.sortOrder,
      isVisible: section.isVisible,
      media: section.media.map(mediaReference),
    })),
  };
}

type SettingsRow = Prisma.SiteSettingsGetPayload<{
  include: { socialLinks: true };
}>;

function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

export function mapSettings(row: SettingsRow): SiteSettingsDto {
  if (row.id !== "default") {
    throw new Error("Site settings singleton key is invalid.");
  }
  return {
    id: "default",
    timeZone: row.timeZone,
    siteName: row.siteName,
    tagline: row.tagline,
    footerText: row.footerText,
    defaultSeoTitle: row.defaultSeoTitle,
    defaultSeoDescription: row.defaultSeoDescription,
    logoMediaId: row.logoMediaId,
    stickyLogoMediaId: row.stickyLogoMediaId,
    faviconMediaId: row.faviconMediaId,
    defaultOgMediaId: row.defaultOgMediaId,
    socialLinks: [...row.socialLinks]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .flatMap((link) =>
        isSocialPlatform(link.platform)
          ? [
              {
                platform: link.platform,
                label: link.label,
                url: link.url,
                isVisible: link.isVisible,
              },
            ]
          : [],
      ),
  };
}

export function mapMedia(row: MediaRow): MediaAssetDto {
  return {
    id: row.id,
    storageProvider: row.storageProvider,
    storageContainer: row.storageContainer,
    storageKey: row.storageKey,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    checksum: row.checksum,
    altText: row.altText,
    caption: row.caption,
    credit: row.credit,
    focalX: row.focalX === null ? null : row.focalX.toNumber(),
    focalY: row.focalY === null ? null : row.focalY.toNumber(),
    status: row.status,
    rightsStatus: row.rightsStatus,
    sourceReference: row.sourceReference,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapEnquiry(
  row: Omit<ContactEnquiryDto, "branchName"> & {
    branch?: { name: string } | null;
  },
): ContactEnquiryDto {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
  };
}
