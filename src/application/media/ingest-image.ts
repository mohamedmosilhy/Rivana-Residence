import type {
  Clock,
  Hasher,
  IdGenerator,
  ImageProcessor,
  MediaStorage,
} from "@/application/ports/providers";
import type {
  MediaAssetDto,
  MediaRepository,
  MediaRightsStatus,
} from "@/application/ports/repositories";
import { failure, type Result } from "@/application/shared/result";
import {
  MEDIA_UPLOAD_POLICY,
  checkDecodedImage,
  checkUploadDeclaration,
  detectImageFormat,
  displayFilename,
  storageKeyFor,
} from "@/domain/media/media-asset";

export type IngestDependencies = Readonly<{
  media: MediaRepository;
  storage: MediaStorage;
  images: ImageProcessor;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
}>;

export type IngestRequest = Readonly<{
  filename: string;
  declaredType: string;
  declaredBytes: number | null;
  source: AsyncIterable<Uint8Array>;
  altText: string;
  rightsStatus: MediaRightsStatus;
  sourceReference: string | null;
  createdById: string | null;
}>;

function rejected(reason: string) {
  return failure("VALIDATION", reason, { file: [reason] });
}

/**
 * The one path by which an image enters the library, for uploads and
 * imports alike:
 *
 * 1. check the declared name, type, and size;
 * 2. record a PENDING asset and stream the bytes into quarantine (capped);
 * 3. check magic bytes and a decode against the declared type and limits;
 * 4. re-encode to strip metadata and hidden payloads;
 * 5. refuse duplicates, store the object under a new immutable key, and
 *    mark the asset READY.
 *
 * Any failure marks the asset FAILED with a readable reason and removes the
 * quarantined bytes, so nothing unverified is ever served.
 */
export async function ingestImage(
  deps: IngestDependencies,
  request: IngestRequest,
): Promise<Result<MediaAssetDto>> {
  const declared = checkUploadDeclaration(request);
  if (declared.reason !== undefined) return rejected(declared.reason);
  const format = declared.format;

  const id = deps.ids.next();
  const storageKey = storageKeyFor(id, format, deps.clock.now());
  const pending = await deps.media.createPending({
    id,
    storageKey,
    originalFilename: displayFilename(request.filename),
    mimeType: request.declaredType,
    declaredBytes: request.declaredBytes ?? 1,
    altText: request.altText,
    rightsStatus: request.rightsStatus,
    sourceReference: request.sourceReference,
    createdById: request.createdById,
  });
  if (!pending.ok) return pending;

  let stored = false;
  const fail = async (reason: string) => {
    await deps.media.markFailed(id, reason);
    await deps.storage.discardQuarantine(id);
    return rejected(reason);
  };

  try {
    const written = await deps.storage.writeQuarantine(
      id,
      request.source,
      MEDIA_UPLOAD_POLICY.maxBytes,
    );
    if (!written.ok) return fail("Images must be 15 MB or smaller.");
    if (written.bytes === 0) return fail("The file is empty.");

    const bytes = await deps.storage.readQuarantine(id);
    const rejection = checkDecodedImage(
      format,
      detectImageFormat(bytes),
      await deps.images.inspect(bytes),
    );
    if (rejection) return fail(rejection.reason);

    let sanitized;
    try {
      sanitized = await deps.images.sanitize(bytes, format);
    } catch {
      return fail("The file is not a readable image.");
    }

    const checksum = deps.hasher.sha256(sanitized.bytes);
    const duplicate = await deps.media.findReadyByChecksum(checksum);
    if (duplicate) {
      // A duplicate leaves nothing behind and points to the existing image.
      const reason = "This image is already in the library.";
      await deps.media.markFailed(id, reason);
      await deps.storage.discardQuarantine(id);
      await deps.media.purge(id);
      return failure("CONFLICT", reason, {
        file: [reason],
        duplicateOf: [duplicate.id],
      });
    }

    await deps.storage.put(storageKey, sanitized.bytes);
    stored = true;
    const ready = await deps.media.markReady(id, {
      bytes: sanitized.bytes.byteLength,
      width: sanitized.width,
      height: sanitized.height,
      checksum,
    });
    if (!ready.ok) {
      // e.g. an identical image finished uploading at the same moment.
      await deps.storage.delete(storageKey);
      return fail(
        ready.error.code === "CONFLICT"
          ? "This image is already in the library."
          : "The upload could not be finished. Try again.",
      );
    }
    await deps.storage.discardQuarantine(id);
    return ready;
  } catch (error) {
    // Unexpected storage or database failure: leave no half-stored object.
    await deps.media.markFailed(
      id,
      "The upload could not be stored. Try again.",
    );
    await deps.storage.discardQuarantine(id).catch(() => undefined);
    if (stored) await deps.storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}
