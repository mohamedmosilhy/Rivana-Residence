import type { MediaDetailsInput } from "@/domain/media/media-asset";
import type { MediaStatus } from "@/domain/shared/types";
import type { Result } from "@/application/shared/result";
import type { PageRequest, PagedResult } from "@/application/shared/pagination";
import type { Actor } from "@/application/shared/actor";

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
  | "SITE_SETTINGS"
  | "BRANCH";

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
  /** Slug of the owning branch (cache tags); null for site settings. */
  branchSlug: string | null;
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

export type StoredObject = Readonly<{
  /** The object's bytes, or the requested range of them. */
  stream: ReadableStream<Uint8Array>;
  /** Total object size in bytes. */
  size: number;
}>;

export type ByteRange = Readonly<{ start: number; end: number }>;

/**
 * Provider-neutral object storage for media. Keys are server-generated
 * relative paths (see `storageKeyFor`); implementations must refuse any key
 * or upload id that could escape their root, and must never overwrite an
 * existing object. No filesystem or SDK type crosses this boundary.
 */
export interface MediaStorage {
  readonly provider: string;
  readonly container: string;
  /** Streams an upload into non-public quarantine, stopping past maxBytes. */
  writeQuarantine(
    uploadId: string,
    source: AsyncIterable<Uint8Array>,
    maxBytes: number,
  ): Promise<{ ok: true; bytes: number } | { ok: false; reason: "TOO_LARGE" }>;
  readQuarantine(uploadId: string): Promise<Uint8Array>;
  /** Idempotent. */
  discardQuarantine(uploadId: string): Promise<void>;
  /** Quarantined uploads and when they were last written, for cleanup. */
  listQuarantine(): Promise<
    readonly Readonly<{ uploadId: string; modifiedAt: Date }>[]
  >;
  /** Writes a final object atomically; fails if the key already exists. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** Null when the object does not exist. */
  open(key: string, range?: ByteRange): Promise<StoredObject | null>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
}

export type ImageInfo = Readonly<{
  format: "jpeg" | "png" | "webp" | "avif";
  width: number;
  height: number;
  pages: number;
}>;

export interface ImageProcessor {
  /** Fully decodes the image; null when it cannot be decoded. */
  inspect(bytes: Uint8Array): Promise<ImageInfo | null>;
  /**
   * Re-encodes in the same format, applying orientation and dropping
   * metadata (EXIF, GPS, comments) and any trailing or embedded payload.
   */
  sanitize(
    bytes: Uint8Array,
    format: ImageInfo["format"],
  ): Promise<Readonly<{ bytes: Uint8Array; width: number; height: number }>>;
}

export interface Hasher {
  sha256(bytes: Uint8Array): string;
}
