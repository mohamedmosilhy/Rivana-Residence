import "server-only";

import os from "node:os";
import path from "node:path";

import { CleanupMedia } from "@/application/media/cleanup-media";
import type { IngestDependencies } from "@/application/media/ingest-image";
import { MediaLibrary } from "@/application/media/media-library";
import type { ByteRange } from "@/application/ports/providers";
import { isSafeStorageKey } from "@/domain/media/media-asset";
import { NextCacheInvalidator } from "@/infrastructure/cache/next-cache-invalidator";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import { LocalMediaStorage } from "@/infrastructure/media/local-media-storage";
import { NodeHasher } from "@/infrastructure/media/node-hasher";
import { SharpImageProcessor } from "@/infrastructure/media/sharp-image-processor";
import { getServerEnv } from "@/lib/env/server";

const clock = { now: () => new Date() };

let storage: Promise<LocalMediaStorage> | undefined;

/**
 * The media root comes only from server configuration. In production it is
 * required and must be outside the application directory; elsewhere it
 * defaults to a temporary directory.
 */
function mediaStorage() {
  storage ??= (async () => {
    const env = getServerEnv();
    const production = env.NODE_ENV === "production";
    const root =
      env.MEDIA_STORAGE_ROOT ?? path.join(os.tmpdir(), "rivana-media-dev");
    // The media root is runtime data outside the app, never a build input,
    // so tell Turbopack not to trace (and bundle) what it points at.
    return LocalMediaStorage.create(
      path.resolve(/*turbopackIgnore: true*/ root),
      {
        ...(production
          ? {
              forbidInside: path.resolve(
                /*turbopackIgnore: true*/ process.cwd(),
              ),
            }
          : {}),
      },
    );
  })();
  return storage;
}

async function dependencies(): Promise<IngestDependencies> {
  return {
    media: new PrismaMediaRepository(),
    storage: await mediaStorage(),
    images: new SharpImageProcessor(),
    hasher: new NodeHasher(),
    ids: new Cuid2IdGenerator(),
    clock,
  };
}

export async function mediaLibrary() {
  return new MediaLibrary(await dependencies(), new NextCacheInvalidator());
}

export async function cleanupMedia() {
  return new CleanupMedia(await dependencies(), clock);
}

/**
 * CSRF defence for the upload route: the browser must say the request comes
 * from this site's own origin. Server Actions get the same check from Next.
 */
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  if (!origin) return false;
  return origin === new URL(getServerEnv().APP_URL).origin;
}

export type PublicMediaResponse =
  | Readonly<{ status: 404 }>
  | Readonly<{ status: 416; size: number }>
  | Readonly<{
      status: 200 | 206 | 304;
      mimeType: string;
      size: number;
      etag: string | null;
      range: ByteRange | null;
      body: ReadableStream<Uint8Array> | null;
    }>;

function parseRange(
  header: string | null,
  size: number,
): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  // Multiple or malformed ranges: serve the whole object instead.
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

/** Serves only READY images, by their database-backed key. */
export async function openPublicMedia(
  key: string,
  request: Request,
  includeBody: boolean,
): Promise<PublicMediaResponse> {
  if (!isSafeStorageKey(key)) return { status: 404 };
  const asset = await new PrismaMediaRepository().findServable(key);
  if (!asset) return { status: 404 };
  const etag = asset.checksum ? `"${asset.checksum}"` : null;
  const common = { mimeType: asset.mimeType, etag };

  if (etag && request.headers.get("if-none-match") === etag) {
    return {
      ...common,
      status: 304,
      size: asset.bytes,
      range: null,
      body: null,
    };
  }
  const range = parseRange(request.headers.get("range"), asset.bytes);
  if (range === "invalid") return { status: 416, size: asset.bytes };

  const object = includeBody
    ? await (await mediaStorage()).open(key, range ?? undefined)
    : null;
  if (includeBody && !object) return { status: 404 };
  return {
    ...common,
    status: range ? 206 : 200,
    size: object?.size ?? asset.bytes,
    range,
    body: object?.stream ?? null,
  };
}
