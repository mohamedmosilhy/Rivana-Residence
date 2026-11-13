import type { PageKey, PageSectionType } from "@/domain/content/page-sections";
import type { z } from "zod";
import type { facilityDraftSchema } from "@/domain/facilities/facility";
import type { roomDraftSchema } from "@/domain/rooms/room";
import type { PageSectionMediaRole } from "@/domain/media/media-asset";
import type {
  AccommodationType,
  MediaStatus,
  PublicationStatus,
  RichTextDocument,
} from "@/domain/shared/types";
import type { Result } from "@/application/shared/result";
import type { Actor } from "@/application/shared/actor";

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
  branchId: string;
  name: string;
  slug: string;
  accommodationType: AccommodationType;
  bedroomCount: number | null;
  bathroomCount: number | null;
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
  branchId: string;
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
  branchId: string;
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

// Rooms and facilities belong to one branch (ADR 017, ADR 026). Lists, slug
// lookups, creation, and ordering are per branch; slugs stay globally unique.
export interface RoomRepository {
  listPublished(branchId: string): Promise<readonly RoomDto[]>;
  findPublishedBySlug(branchId: string, slug: string): Promise<RoomDto | null>;
  listAdmin(branchId: string): Promise<readonly RoomDto[]>;
  findAdminById(id: string): Promise<RoomDto | null>;
  create(
    branchId: string,
    input: RoomInput,
    actor: Actor,
  ): Promise<Result<RoomDto>>;
  update(id: string, input: RoomInput, actor: Actor): Promise<Result<RoomDto>>;
  publish(id: string, actor: Actor): Promise<Result<RoomDto>>;
  /** PUBLISHED → DRAFT. */
  unpublish(id: string, actor: Actor): Promise<Result<RoomDto>>;
  archive(id: string, actor: Actor): Promise<Result<void>>;
  /** ARCHIVED → DRAFT, appended to the end of the order. */
  restore(id: string, actor: Actor): Promise<Result<RoomDto>>;
  /** Permanently removes an archived record; CONFLICT otherwise. */
  delete(id: string, actor: Actor): Promise<Result<void>>;
  /** Exactly the branch's non-archived ids, in the new order. */
  reorder(
    branchId: string,
    orderedIds: readonly string[],
    actor: Actor,
  ): Promise<Result<void>>;
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
  listPublished(branchId: string): Promise<readonly FacilityDto[]>;
  findPublishedBySlug(
    branchId: string,
    slug: string,
  ): Promise<FacilityDto | null>;
  listAdmin(branchId: string): Promise<readonly FacilityDto[]>;
  findAdminById(id: string): Promise<FacilityDto | null>;
  create(
    branchId: string,
    input: FacilityInput,
    actor: Actor,
  ): Promise<Result<FacilityDto>>;
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
  /** Exactly the branch's non-archived ids, in the new order. */
  reorder(
    branchId: string,
    orderedIds: readonly string[],
    actor: Actor,
  ): Promise<Result<void>>;
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

// Each branch has its own Home, About, and Contact page; a page is addressed
// by (branchId, key) (ADR 026).
export interface PageRepository {
  findPublishedByKey(branchId: string, key: PageKey): Promise<PageDto | null>;
  findAdminByKey(branchId: string, key: PageKey): Promise<PageDto | null>;
  publish(
    branchId: string,
    key: PageKey,
    actor: Actor,
  ): Promise<Result<PageDto>>;
  unpublish(
    branchId: string,
    key: PageKey,
    actor: Actor,
  ): Promise<Result<PageDto>>;
  updateDetails(
    branchId: string,
    key: PageKey,
    input: PageDetailsInput,
    actor: Actor,
  ): Promise<Result<PageDto>>;
  saveSection(
    branchId: string,
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
    branchId: string,
    key: PageKey,
    sectionId: string,
    media: readonly SectionMediaAssignment[],
    actor: Actor,
  ): Promise<Result<PageDto>>;
}
