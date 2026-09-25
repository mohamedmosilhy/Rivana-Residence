import type { PageKey, PageSectionType } from "@/domain/content/page-sections";
import type { FacilityDraft } from "@/domain/facilities/facility";
import type { PromotionDraft } from "@/domain/promotions/promotion";
import type { RoomDraft } from "@/domain/rooms/room";
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
}>;

export type MediaAssignment = Readonly<{
  mediaId: string;
  role: "HERO" | "GALLERY";
  sortOrder: number;
  altOverride: string | null;
}>;

export type RoomInput = RoomDraft & Readonly<{ featured: boolean }>;
export type FacilityInput = FacilityDraft & Readonly<{ featured: boolean }>;
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
  featured: boolean;
  sortOrder: number;
  status: PublicationStatus;
  media: readonly MediaReference[];
}>;

export type FacilityDto = Readonly<{
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: RichTextDocument;
  openingHoursText: string | null;
  featured: boolean;
  sortOrder: number;
  status: PublicationStatus;
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
}>;

export type PageDto = Readonly<{
  id: string;
  key: PageKey;
  title: string;
  canonicalPath: string;
  isPublished: boolean;
  sections: readonly PageSectionDto[];
}>;

export type SiteSettingsDto = Readonly<{
  id: "default";
  siteName: string;
  timeZone: string;
  phone: string | null;
  email: string | null;
  footerText: string | null;
}>;

export type MediaAssetDto = Readonly<{
  id: string;
  storageProvider: string;
  storageContainer: string;
  storageKey: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  status: MediaStatus;
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
  archive(id: string, actor: Actor): Promise<Result<void>>;
  reorder(orderedIds: readonly string[], actor: Actor): Promise<Result<void>>;
  replaceMedia(
    id: string,
    media: readonly MediaAssignment[],
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
  archive(id: string, actor: Actor): Promise<Result<void>>;
  reorder(orderedIds: readonly string[], actor: Actor): Promise<Result<void>>;
  replaceMedia(
    id: string,
    media: readonly MediaAssignment[],
    actor: Actor,
  ): Promise<Result<FacilityDto>>;
}

export interface PageRepository {
  findPublishedByKey(key: PageKey): Promise<PageDto | null>;
  findAdminByKey(key: PageKey): Promise<PageDto | null>;
  publish(key: PageKey, actor: Actor): Promise<Result<PageDto>>;
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
}

export interface SettingsRepository {
  getPublic(): Promise<SiteSettingsDto | null>;
  getAdmin(): Promise<SiteSettingsDto | null>;
}

export interface MediaRepository {
  findAdminById(id: string): Promise<MediaAssetDto | null>;
  countUsage(id: string): Promise<number>;
  finalize(id: string, actor: Actor): Promise<Result<MediaAssetDto>>;
  deleteIfUnreferenced(id: string, actor: Actor): Promise<Result<void>>;
}

export interface PromotionRepository {
  getCurrent(now: Date): Promise<PromotionDto | null>;
  listAdmin(): Promise<readonly PromotionDto[]>;
  create(input: PromotionInput, actor: Actor): Promise<Result<PromotionDto>>;
  update(
    id: string,
    input: PromotionInput,
    actor: Actor,
  ): Promise<Result<PromotionDto>>;
  publish(id: string, actor: Actor, now: Date): Promise<Result<PromotionDto>>;
  archive(id: string, actor: Actor): Promise<Result<void>>;
}

export interface EnquiryRepository {
  listAdmin(status?: EnquiryStatus): Promise<readonly ContactEnquiryDto[]>;
  create(
    input: Omit<ContactEnquiryDto, "id" | "status" | "createdAt">,
  ): Promise<Result<ContactEnquiryDto>>;
  archive(id: string, actor: Actor, now: Date): Promise<Result<void>>;
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
