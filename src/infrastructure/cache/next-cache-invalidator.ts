import "server-only";

import { revalidateTag, updateTag } from "next/cache";

import type { CacheInvalidator } from "@/application/ports/providers";

// `updateTag` expires the tag immediately (read-your-own-writes), which is
// what an editor expects after pressing Save. It only works inside Server
// Actions. Route Handlers use NextRouteCacheInvalidator instead.
export class NextCacheInvalidator implements CacheInvalidator {
  async invalidate(tags: readonly string[]) {
    for (const tag of new Set(tags)) updateTag(tag);
  }
}

/** Immediate expiry for REST writes, where updateTag is not supported. */
export class NextRouteCacheInvalidator implements CacheInvalidator {
  async invalidate(tags: readonly string[]) {
    for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
  }
}
