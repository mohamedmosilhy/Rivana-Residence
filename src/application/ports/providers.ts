export type BookingLaunchDescriptor =
  | Readonly<{
      available: false;
      reason: "NOT_CONFIGURED";
      accessibleMessage: string;
    }>
  | Readonly<{
      available: true;
      mode: "LINK" | "EMBED";
      url: string;
    }>;

export interface BookingProvider {
  getLaunchDescriptor(): Promise<BookingLaunchDescriptor>;
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

export interface ContactDelivery {
  deliver(input: {
    enquiryId: string;
    replyTo: string;
    subject: string;
    text: string;
  }): Promise<{ messageId: string }>;
}

export interface CacheInvalidator {
  invalidate(tags: readonly string[]): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
