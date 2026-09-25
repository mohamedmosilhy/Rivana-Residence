import "server-only";

import type {
  ContactEnquiryDto,
  FacilityDto,
  MediaAssetDto,
  PageDto,
  PromotionDto,
  RoomDto,
  SiteSettingsDto,
} from "@/application/ports/repositories";
import {
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/domain/settings/site-settings";
import type { RichTextDocument } from "@/domain/shared/types";
import { Prisma } from "@/generated/prisma/client";

export const roomGraph = {
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

export const pageGraph = {
  sections: {
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.PageInclude;

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
    name: row.name,
    slug: row.slug,
    shortDescription: row.shortDescription,
    description: richText(row.description),
    sizeSqm: row.sizeSqm ? Number(row.sizeSqm) : null,
    maxAdults: row.maxAdults,
    maxChildren: row.maxChildren,
    bedSummary: row.bedSummary,
    viewSummary: row.viewSummary,
    featured: row.featured,
    sortOrder: row.sortOrder,
    status: row.status,
    media: row.media.map((usage) => ({
      id: usage.media.id,
      role: usage.role,
      sortOrder: usage.sortOrder,
      status: usage.media.status,
      altText: usage.media.altText,
      altOverride: usage.altOverride,
    })),
  };
}

export function mapFacility(row: FacilityRow): FacilityDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.shortDescription,
    description: richText(row.description),
    openingHoursText: row.openingHoursText,
    featured: row.featured,
    sortOrder: row.sortOrder,
    status: row.status,
    media: row.media.map((usage) => ({
      id: usage.media.id,
      role: usage.role,
      sortOrder: usage.sortOrder,
      status: usage.media.status,
      altText: usage.media.altText,
      altOverride: usage.altOverride,
    })),
  };
}

export function mapPage(row: PageRow): PageDto {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    canonicalPath: row.canonicalPath,
    isPublished: row.isPublished,
    sections: row.sections.map((section) => ({
      id: section.id,
      type: section.type,
      heading: section.heading,
      eyebrow: section.eyebrow,
      payload: section.payload,
      sortOrder: section.sortOrder,
      isVisible: section.isVisible,
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
    phone: row.phone,
    email: row.email,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    country: row.country,
    latitude: row.latitude === null ? null : row.latitude.toNumber(),
    longitude: row.longitude === null ? null : row.longitude.toNumber(),
    mapEmbedUrl: row.mapEmbedUrl,
    footerText: row.footerText,
    defaultSeoTitle: row.defaultSeoTitle,
    defaultSeoDescription: row.defaultSeoDescription,
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

export function mapMedia(row: {
  id: string;
  storageProvider: string;
  storageContainer: string;
  storageKey: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  status: MediaAssetDto["status"];
}): MediaAssetDto {
  return row;
}

export function mapPromotion(row: PromotionDto): PromotionDto {
  return {
    id: row.id,
    internalName: row.internalName,
    headline: row.headline,
    body: row.body,
    code: row.code,
    terms: row.terms,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    priority: row.priority,
    showAsPopup: row.showAsPopup,
    version: row.version,
    publishedAt: row.publishedAt,
  };
}

export function mapEnquiry(row: ContactEnquiryDto): ContactEnquiryDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
  };
}
