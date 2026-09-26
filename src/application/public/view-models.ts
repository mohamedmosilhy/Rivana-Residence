import type {
  FacilityDto,
  MediaReference,
  PageDto,
  PromotionDto,
  RoomDto,
  SectionMediaReference,
  SiteSettingsDto,
} from "@/application/ports/repositories";
import type { PageKey, PageSectionType } from "@/domain/content/page-sections";
import { publicMediaPath } from "@/domain/media/media-asset";
import type { SocialPlatform } from "@/domain/settings/site-settings";
import type { RichTextDocument } from "@/domain/shared/types";

// Everything here is plain, JSON-serializable data: it crosses the cache and
// the server/client boundary, and it never carries drafts, internal ids that
// visitors don't need, or images that are not ready and rights-confirmed.

export type PublicImage = Readonly<{
  src: string;
  alt: string;
  width: number;
  height: number;
  /** CSS object-position from the focal point, e.g. "30% 70%". */
  position: string;
}>;

type ImageSource = Pick<
  MediaReference,
  | "storageKey"
  | "status"
  | "rightsConfirmed"
  | "altText"
  | "altOverride"
  | "width"
  | "height"
  | "focalX"
  | "focalY"
>;

export function publicImage(
  source: ImageSource | null | undefined,
): PublicImage | null {
  if (
    !source ||
    source.status !== "READY" ||
    !source.rightsConfirmed ||
    !source.width ||
    !source.height
  ) {
    return null;
  }
  const percent = (value: number | null) =>
    value === null ? "50%" : `${Math.round(value * 100)}%`;
  return {
    src: publicMediaPath(source.storageKey),
    alt: (source.altOverride ?? source.altText).trim(),
    width: source.width,
    height: source.height,
    position: `${percent(source.focalX)} ${percent(source.focalY)}`,
  };
}

function images(media: readonly MediaReference[]) {
  const ordered = [...media].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    hero: publicImage(ordered.find((item) => item.role === "HERO")),
    gallery: ordered
      .filter((item) => item.role === "GALLERY")
      .map(publicImage)
      .filter((image): image is PublicImage => image !== null),
  };
}

export type PublicSocialLink = Readonly<{
  platform: SocialPlatform;
  label: string;
  url: string;
}>;

export type PublicSettings = Readonly<{
  siteName: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  addressLines: readonly string[];
  latitude: number | null;
  longitude: number | null;
  mapEmbedUrl: string | null;
  footerText: string | null;
  defaultSeoTitle: string | null;
  defaultSeoDescription: string | null;
  socialLinks: readonly PublicSocialLink[];
  logo: PublicImage | null;
  favicon: PublicImage | null;
  defaultShareImage: PublicImage | null;
}>;

export function publicSettings(
  settings: SiteSettingsDto,
  logo: PublicImage | null,
  favicon: PublicImage | null,
  defaultShareImage: PublicImage | null,
): PublicSettings {
  return {
    siteName: settings.siteName,
    tagline: settings.tagline,
    phone: settings.phone,
    email: settings.email,
    addressLine1: settings.addressLine1,
    addressLine2: settings.addressLine2,
    city: settings.city,
    country: settings.country,
    addressLines: [
      settings.addressLine1,
      settings.addressLine2,
      [settings.city, settings.country].filter(Boolean).join(", ") || null,
    ].filter((line): line is string => Boolean(line)),
    latitude: settings.latitude,
    longitude: settings.longitude,
    mapEmbedUrl: settings.mapEmbedUrl,
    footerText: settings.footerText,
    defaultSeoTitle: settings.defaultSeoTitle,
    defaultSeoDescription: settings.defaultSeoDescription,
    socialLinks: settings.socialLinks
      .filter((link) => link.isVisible)
      .map(({ platform, label, url }) => ({ platform, label, url })),
    logo,
    favicon,
    defaultShareImage,
  };
}

export type PublicRoomFacts = Readonly<{
  sizeSqm: number | null;
  maxAdults: number;
  maxChildren: number;
  bedSummary: string | null;
  viewSummary: string | null;
}>;

export type PublicRoomCard = Readonly<{
  slug: string;
  name: string;
  shortDescription: string;
  featured: boolean;
  updatedAt: string;
  facts: PublicRoomFacts;
  hero: PublicImage | null;
}>;

export type PublicRoom = PublicRoomCard &
  Readonly<{
    description: RichTextDocument;
    features: readonly string[];
    gallery: readonly PublicImage[];
    socialImage: PublicImage | null;
    seoTitle: string | null;
    seoDescription: string | null;
  }>;

export function publicRoom(
  room: RoomDto,
  socialImage: PublicImage | null = null,
): PublicRoom {
  const { hero, gallery } = images(room.media);
  return {
    slug: room.slug,
    name: room.name,
    shortDescription: room.shortDescription,
    featured: room.featured,
    updatedAt: room.updatedAt.toISOString(),
    facts: {
      sizeSqm: room.sizeSqm,
      maxAdults: room.maxAdults,
      maxChildren: room.maxChildren,
      bedSummary: room.bedSummary,
      viewSummary: room.viewSummary,
    },
    hero,
    description: room.description,
    features: room.features.map((feature) => feature.label),
    gallery,
    socialImage,
    seoTitle: room.seoTitle,
    seoDescription: room.seoDescription,
  };
}

export type PublicFacilityCard = Readonly<{
  slug: string;
  name: string;
  shortDescription: string;
  featured: boolean;
  updatedAt: string;
  openingHoursText: string | null;
  hero: PublicImage | null;
}>;

export type PublicFacility = PublicFacilityCard &
  Readonly<{
    description: RichTextDocument;
    gallery: readonly PublicImage[];
    socialImage: PublicImage | null;
    seoTitle: string | null;
    seoDescription: string | null;
  }>;

export function publicFacility(
  facility: FacilityDto,
  socialImage: PublicImage | null = null,
): PublicFacility {
  const { hero, gallery } = images(facility.media);
  return {
    slug: facility.slug,
    name: facility.name,
    shortDescription: facility.shortDescription,
    featured: facility.featured,
    updatedAt: facility.updatedAt.toISOString(),
    openingHoursText: facility.openingHoursText,
    hero,
    description: facility.description,
    gallery,
    socialImage,
    seoTitle: facility.seoTitle,
    seoDescription: facility.seoDescription,
  };
}

export type PublicSection = Readonly<{
  id: string;
  type: PageSectionType;
  heading: string | null;
  eyebrow: string | null;
  payload: unknown;
  /** Ready, rights-confirmed images by role, in order. */
  images: Readonly<Record<string, readonly PublicImage[]>>;
}>;

export type PublicPage = Readonly<{
  key: PageKey;
  title: string;
  canonicalPath: string;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  socialImage: PublicImage | null;
  sections: readonly PublicSection[];
}>;

function sectionImages(media: readonly SectionMediaReference[]) {
  const byRole: Record<string, PublicImage[]> = {};
  for (const item of [...media].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const image = publicImage(item);
    if (image) (byRole[item.role] ??= []).push(image);
  }
  return byRole;
}

export function publicPage(
  page: PageDto,
  socialImage: PublicImage | null = null,
): PublicPage {
  return {
    key: page.key,
    title: page.title,
    canonicalPath: page.canonicalPath,
    updatedAt: page.updatedAt.toISOString(),
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    socialImage,
    sections: page.sections.map((section) => ({
      id: section.id,
      type: section.type,
      heading: section.heading,
      eyebrow: section.eyebrow,
      payload: section.payload,
      images: sectionImages(section.media),
    })),
  };
}

/** A published pop-up campaign, with its window as ISO strings. */
export type PublicPromotionCandidate = Readonly<{
  id: string;
  version: number;
  headline: string;
  body: string;
  code: string;
  terms: string | null;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
}>;

export type PublicPromotion = Pick<
  PublicPromotionCandidate,
  "id" | "version" | "headline" | "body" | "code" | "terms"
>;

export function publicPromotionCandidate(
  promotion: PromotionDto,
): PublicPromotionCandidate {
  return {
    id: promotion.id,
    version: promotion.version,
    headline: promotion.headline,
    body: promotion.body,
    code: promotion.code,
    terms: promotion.terms,
    priority: promotion.priority,
    startsAt: promotion.startsAt?.toISOString() ?? null,
    endsAt: promotion.endsAt?.toISOString() ?? null,
    publishedAt: promotion.publishedAt?.toISOString() ?? null,
  };
}
