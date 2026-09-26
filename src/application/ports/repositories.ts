import type { PageKey, PageSectionType } from "@/domain/content/page-sections";
import type { z } from "zod";

import type { facilityDraftSchema } from "@/domain/facilities/facility";
import type { PromotionDraft } from "@/domain/promotions/promotion";
import type { roomDraftSchema } from "@/domain/rooms/room";
import type {
  SiteSettingsInput,
  SocialLinkInput,
} from "@/domain/settings/site-settings";
import type {
  MediaDetailsInput,
  PageSectionMediaRole,
} from "@/domain/media/media-asset";
import type {
  AdminRole,
  EnquiryStatus,
  MediaStatus,
  PublicationStatus,
  RichTextDocument,
} from "@/domain/shared/types";
import type { Result } from "@/application/shared/result";

export type Actor = Readonly<{
  id: string;
  role: AdminRole;
}>;

export type MediaReference = Readonly<{
  id: string;
  role: "HERO" | "GALLERY";
  sortOrder: number;
  status: MediaStatus;
  altText: string;
  altOverride: string | null;
  storageKey: string;
  rightsConfirmed: boolean;
  width: number | null;
  height: number | null;
  /** 0–1 from the left/top, or null for the centre. */
  focalX: number | null;
  focalY: number | null;
}>;

export type SectionMediaReference = Omit<MediaReference, "role"> &
  Readonly<{ role: PageSectionMediaRole }>;

export type SectionMediaAssignment = Readonly<{
  mediaId: string;
  role: PageSectionMediaRole;
  sortOrder: number;
  altOverride: string | null;
}>;

export type MediaAssignment = Readonly<{
  mediaId: string;
  role: "HERO" | "GALLERY";
  sortOrder: number;
  altOverride: string | null;
}>;

// Inputs use the schema's input type so optional fields with defaults (SEO,
// features) can be omitted; repositories re-parse every input.
export type RoomInput = z.input<typeof roomDraftSchema> &
  Readonly<{ featured: boolean }>;
export type FacilityInput = z.input<typeof facilityDraftSchema> &
  Readonly<{ featured: boolean }>;
export type PromotionInput = PromotionDraft;

export type PageSectionInput = Readonly<{
  id: string | null;
  type: PageSectionType;
  heading: string | null;
  eyebrow: string | null;
  payload: unknown;
  isVisible: boolean;
}>;

export type RoomDto = Readonly<{
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: RichTextDocument;
  sizeSqm: number | null;
  maxAdults: number;
  maxChildren: number;
  bedSummary: string | null;
  viewSummary: string | null;
  features: readonly Readonly<{ label: string }>[];
  seoTitle: string | null;
  seoDescription: string | null;
  ogMediaId: string | null;
  featured: boolean;
  sortOrder: number;
  status: PublicationStatus;
  updatedAt: Date;
  media: readonly MediaReference[];
}>;

export type FacilityDto = Readonly<{
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: RichTextDocument;
  openingHoursText: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogMediaId: string | null;
  featured: boolean;
  sortOrder: number;
  status: PublicationStatus;
  updatedAt: Date;
  media: readonly MediaReference[];
}>;

export type PageSectionDto = Readonly<{
  id: string;
  type: PageSectionType;
  heading: string | null;
  eyebrow: string | null;
  payload: unknown;
  sortOrder: number;
  isVisible: boolean;
  media: readonly SectionMediaReference[];
}>;

export type PageDto = Readonly<{
  id: string;
  key: PageKey;
  title: string;
  canonicalPath: string;
  isPublished: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  ogMediaId: string | null;
  updatedAt: Date;
  sections: readonly PageSectionDto[];
}>;

export type PageDetailsInput = Readonly<{
  seoTitle: string | null;
  seoDescription: string | null;
  ogMediaId: string | null;
}>;

export type SocialLinkDto = SocialLinkInput;

export type SiteSettingsDto = Readonly<
  SiteSettingsInput & {
    id: "default";
    timeZone: string;
    /** Ordered for display. Public reads include visible links only. */
    socialLinks: readonly SocialLinkDto[];
    logoMediaId: string | null;
    stickyLogoMediaId: string | null;
    faviconMediaId: string | null;
    defaultOgMediaId: string | null;
  }
>;

export type AdminSiteSettingsDto = SiteSettingsDto &
  Readonly<{
    updatedAt: Date;
    updatedByName: string | null;
  }>;

export type SiteImagesInput = Readonly<{
  logoMediaId: string | null;
  stickyLogoMediaId: string | null;
  faviconMediaId: string | null;
  defaultOgMediaId: string | null;
}>;

export type MediaRightsStatus = "CONFIRMED" | "UNCONFIRMED";

export type MediaAssetDto = Readonly<{
  id: string;
  storageProvider: string;
  storageContainer: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
  altText: string;
  caption: string | null;
  credit: string | null;
  focalX: number | null;
  focalY: number | null;
  status: MediaStatus;
  rightsStatus: MediaRightsStatus;
  sourceReference: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type MediaUsageKind =
  | "ROOM"
  | "FACILITY"
  | "PAGE_SECTION"
  | "PAGE_SHARING"
  | "ROOM_SHARING"
  | "FACILITY_SHARING"
  | "SITE_SETTINGS";

/** One place an image is used, with enough context to link to it. */
export type MediaUsage = Readonly<{
  kind: MediaUsageKind;
  /** Room/facility id, page key, or "default" for settings. */
  ownerId: string;
  ownerName: string;
  /** e.g. "Hero", "Gallery", "Logo". */
  role: string;
  /** Whether the owner is public, so a change is visible to visitors. */
  isPublic: boolean;
  /** Public slug for rooms/facilities (cache tags). */
  slug: string | null;
}>;

export type MediaDetailsDto = MediaAssetDto &
  Readonly<{
    createdByName: string | null;
    usage: readonly MediaUsage[];
  }>;

export type MediaListItem = MediaAssetDto & Readonly<{ usageCount: number }>;

export type MediaListQuery = PageRequest &
  Readonly<{
    search: string | null;
    status: MediaStatus | null;
    mimeType: string | null;
    missingAlt: boolean;
    usage: "used" | "unused" | null;
    rights: MediaRightsStatus | null;
  }>;

export type PendingMediaInput = Readonly<{
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  declaredBytes: number;
  altText: string;
  rightsStatus: MediaRightsStatus;
  sourceReference: string | null;
  createdById: string | null;
}>;

export type ReadyMediaInput = Readonly<{
  bytes: number;
  width: number;
  height: number;
  checksum: string;
}>;

/** What the public media route needs to serve one object. */
export type ServableMedia = Readonly<{
  storageKey: string;
  mimeType: string;
  bytes: number;
  checksum: string | null;
}>;

export type MediaCleanupCandidates = Readonly<{
  /** PENDING uploads that never finished. */
  stalePending: readonly Readonly<{ id: string }>[];
  /** DELETED records whose objects may still exist. */
  deleted: readonly Readonly<{ id: string; storageKey: string }>[];
  /** Old FAILED records (no object was ever stored). */
  failed: readonly Readonly<{ id: string }>[];
}>;

export type PromotionDto = Readonly<{
  id: string;
  internalName: string;
  headline: string;
  body: string;
  code: string;
  terms: string | null;
  status: PublicationStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  priority: number;
  showAsPopup: boolean;
  version: number;
  publishedAt: Date | null;
  updatedAt: Date;
}>;

/** A ready image that content may reference (Phase 5 selection only). */
export type MediaOption = Readonly<{
  id: string;
  storageKey: string;
  altText: string;
  originalFilename: string;
  width: number | null;
  height: number | null;
  rightsConfirmed: boolean;
}>;

export type ContactEnquiryDto = Readonly<{
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: EnquiryStatus;
  createdAt: Date;
}>;

export interface RoomRepository {
  listPublished(): Promise<readonly RoomDto[]>;
  findPublishedBySlug(slug: string): Promise<RoomDto | null>;
  listAdmin(): Promise<readonly RoomDto[]>;
  findAdminById(id: string): Promise<RoomDto | null>;
  create(input: RoomInput, actor: Actor): Promise<Result<RoomDto>>;
  update(id: string, input: RoomInput, actor: Actor): Promise<Result<RoomDto>>;
  publish(id: string, actor: Actor): Promise<Result<RoomDto>>;
  /** PUBLISHED → DRAFT. */
  unpublish(id: string, actor: Actor): Promise<Result<RoomDto>>;
  archive(id: string, actor: Actor): Promise<Result<void>>;
  /** ARCHIVED → DRAFT, appended to the end of the order. */
  restore(id: string, actor: Actor): Promise<Result<RoomDto>>;
  /** Permanently removes an archived record; CONFLICT otherwise. */
  delete(id: string, actor: Actor): Promise<Result<void>>;
  reorder(orderedIds: readonly string[], actor: Actor): Promise<Result<void>>;
  replaceMedia(
    id: string,
    media: readonly MediaAssignment[],
    actor: Actor,
  ): Promise<Result<RoomDto>>;
  /** The optional social sharing image; must be a ready image. */
  setSocialImage(
    id: string,
    mediaId: string | null,
    actor: Actor,
  ): Promise<Result<RoomDto>>;
}

export interface FacilityRepository {
  listPublished(): Promise<readonly FacilityDto[]>;
  findPublishedBySlug(slug: string): Promise<FacilityDto | null>;
  listAdmin(): Promise<readonly FacilityDto[]>;
  findAdminById(id: string): Promise<FacilityDto | null>;
  create(input: FacilityInput, actor: Actor): Promise<Result<FacilityDto>>;
  update(
    id: string,
    input: FacilityInput,
    actor: Actor,
  ): Promise<Result<FacilityDto>>;
  publish(id: string, actor: Actor): Promise<Result<FacilityDto>>;
  /** PUBLISHED → DRAFT. */
  unpublish(id: string, actor: Actor): Promise<Result<FacilityDto>>;
  archive(id: string, actor: Actor): Promise<Result<void>>;
  /** ARCHIVED → DRAFT, appended to the end of the order. */
  restore(id: string, actor: Actor): Promise<Result<FacilityDto>>;
  /** Permanently removes an archived record; CONFLICT otherwise. */
  delete(id: string, actor: Actor): Promise<Result<void>>;
  reorder(orderedIds: readonly string[], actor: Actor): Promise<Result<void>>;
  replaceMedia(
    id: string,
    media: readonly MediaAssignment[],
    actor: Actor,
  ): Promise<Result<FacilityDto>>;
  /** The optional social sharing image; must be a ready image. */
  setSocialImage(
    id: string,
    mediaId: string | null,
    actor: Actor,
  ): Promise<Result<FacilityDto>>;
}

export interface PageRepository {
  findPublishedByKey(key: PageKey): Promise<PageDto | null>;
  findAdminByKey(key: PageKey): Promise<PageDto | null>;
  publish(key: PageKey, actor: Actor): Promise<Result<PageDto>>;
  unpublish(key: PageKey, actor: Actor): Promise<Result<PageDto>>;
  updateDetails(
    key: PageKey,
    input: PageDetailsInput,
    actor: Actor,
  ): Promise<Result<PageDto>>;
  saveSection(
    key: PageKey,
    section: PageSectionInput,
    actor: Actor,
  ): Promise<Result<PageDto>>;
  reorderSections(
    pageId: string,
    orderedIds: readonly string[],
    actor: Actor,
  ): Promise<Result<void>>;
  replaceSectionMedia(
    key: PageKey,
    sectionId: string,
    media: readonly SectionMediaAssignment[],
    actor: Actor,
  ): Promise<Result<PageDto>>;
}

export interface SettingsRepository {
  getPublic(): Promise<SiteSettingsDto | null>;
  getAdmin(): Promise<AdminSiteSettingsDto | null>;
  /**
   * Writes only when the stored `updatedAt` still equals `expectedUpdatedAt`,
   * otherwise returns CONFLICT so a stale form cannot overwrite newer edits.
   */
  update(
    input: SiteSettingsInput,
    expectedUpdatedAt: Date,
    actor: Actor,
  ): Promise<Result<AdminSiteSettingsDto>>;
  /** Replaces every social link; array order becomes display order. */
  replaceSocialLinks(
    links: readonly SocialLinkInput[],
    expectedUpdatedAt: Date,
    actor: Actor,
  ): Promise<Result<AdminSiteSettingsDto>>;
  /** Brand and default sharing images; each must be a ready image. */
  updateImages(
    input: SiteImagesInput,
    actor: Actor,
  ): Promise<Result<AdminSiteSettingsDto>>;
}

export interface MediaRepository {
  findAdminById(id: string): Promise<MediaAssetDto | null>;
  listReady(): Promise<readonly MediaOption[]>;
  countUsage(id: string): Promise<number>;
  finalize(id: string, actor: Actor): Promise<Result<MediaAssetDto>>;
  deleteIfUnreferenced(id: string, actor: Actor): Promise<Result<void>>;

  createPending(input: PendingMediaInput): Promise<Result<MediaAssetDto>>;
  /** PENDING → READY. Idempotent: an already READY asset is returned as is. */
  markReady(id: string, input: ReadyMediaInput): Promise<Result<MediaAssetDto>>;
  /** PENDING → FAILED with a staff-readable reason. */
  markFailed(id: string, reason: string): Promise<void>;
  findReadyByChecksum(checksum: string): Promise<MediaAssetDto | null>;
  findBySourceReference(reference: string): Promise<MediaAssetDto | null>;
  findServable(storageKey: string): Promise<ServableMedia | null>;
  list(query: MediaListQuery): Promise<PagedResult<MediaListItem>>;
  getDetails(id: string): Promise<MediaDetailsDto | null>;
  updateDetails(
    id: string,
    input: MediaDetailsInput,
    actor: Actor,
  ): Promise<Result<MediaAssetDto>>;
  setRightsStatus(
    id: string,
    status: MediaRightsStatus,
    actor: Actor,
  ): Promise<Result<MediaAssetDto>>;
  /** Points every reference to `fromId` at the ready `toId`, atomically. */
  replaceReferences(
    fromId: string,
    toId: string,
    actor: Actor,
  ): Promise<Result<Readonly<{ replaced: number }>>>;
  /** READY/FAILED → DELETED when unreferenced; REFERENCED otherwise. */
  markDeleted(id: string, actor: Actor): Promise<Result<MediaAssetDto>>;
  /** Removes the row of a DELETED or FAILED, unreferenced asset. */
  purge(id: string): Promise<void>;
  cleanupCandidates(
    pendingBefore: Date,
    failedBefore: Date,
  ): Promise<MediaCleanupCandidates>;
}

export interface PromotionRepository {
  getCurrent(now: Date): Promise<PromotionDto | null>;
  /** Published pop-up promotions that have not ended by `now`. */
  listPublishedPopups(now: Date): Promise<readonly PromotionDto[]>;
  listAdmin(): Promise<readonly PromotionDto[]>;
  findAdminById(id: string): Promise<PromotionDto | null>;
  create(input: PromotionInput, actor: Actor): Promise<Result<PromotionDto>>;
  update(
    id: string,
    input: PromotionInput,
    actor: Actor,
  ): Promise<Result<PromotionDto>>;
  publish(id: string, actor: Actor, now: Date): Promise<Result<PromotionDto>>;
  unpublish(id: string, actor: Actor): Promise<Result<PromotionDto>>;
  archive(id: string, actor: Actor): Promise<Result<void>>;
  restore(id: string, actor: Actor): Promise<Result<PromotionDto>>;
  /** Permanently removes an archived promotion; CONFLICT otherwise. */
  delete(id: string, actor: Actor): Promise<Result<void>>;
}

export type PageRequest = Readonly<{
  /** 1-based. */
  page: number;
  pageSize: number;
}>;

export type PagedResult<T> = Readonly<{
  items: readonly T[];
  total: number;
  page: number;
  pageSize: number;
}>;

export type EnquiryListQuery = PageRequest &
  Readonly<{
    status: EnquiryStatus | null;
    /** Matches sender name, email, or subject, case-insensitively. */
    search: string | null;
  }>;

export interface EnquiryRepository {
  listAdmin(status?: EnquiryStatus): Promise<readonly ContactEnquiryDto[]>;
  listAdminPage(
    query: EnquiryListQuery,
  ): Promise<PagedResult<ContactEnquiryDto>>;
  create(
    input: Omit<ContactEnquiryDto, "id" | "status" | "createdAt">,
  ): Promise<Result<ContactEnquiryDto>>;
  archive(id: string, actor: Actor, now: Date): Promise<Result<void>>;
  /** Records successful delivery; the enquiry stays NEW for staff. */
  markDelivered(id: string, messageId: string): Promise<void>;
  markDeliveryFailed(id: string): Promise<void>;
}

export type PublicationCounts = Readonly<Record<PublicationStatus, number>>;

export type RecentContentKind =
  | "PAGE"
  | "ROOM"
  | "FACILITY"
  | "PROMOTION"
  | "SETTINGS";

export type RecentContentItem = Readonly<{
  kind: RecentContentKind;
  id: string;
  title: string;
  status: PublicationStatus | null;
  updatedAt: Date;
}>;

export type AdminOverviewDto = Readonly<{
  timeZone: string;
  pages: Readonly<{ published: number; total: number }>;
  rooms: PublicationCounts;
  facilities: PublicationCounts;
  media: Readonly<{ ready: number; missingAltText: number; failed: number }>;
  promotions: Readonly<{
    active: Readonly<{
      id: string;
      internalName: string;
      headline: string;
      endsAt: Date | null;
    }> | null;
    scheduledCount: number;
    nextScheduled: Readonly<{
      id: string;
      internalName: string;
      startsAt: Date;
    }> | null;
  }>;
  enquiries: Readonly<{ new: number; deliveryFailed: number }>;
  recent: readonly RecentContentItem[];
}>;

/** Read-only aggregate queries for the admin overview. */
export interface AdminOverviewReader {
  read(now: Date, recentLimit: number): Promise<AdminOverviewDto>;
}

export type TransactionRepositories = Readonly<{
  rooms: RoomRepository;
  facilities: FacilityRepository;
  pages: PageRepository;
  media: MediaRepository;
  promotions: PromotionRepository;
}>;

export interface UnitOfWork {
  run<T>(
    operation: (repositories: TransactionRepositories) => Promise<T>,
  ): Promise<T>;
}
