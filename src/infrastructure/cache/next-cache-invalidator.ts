import "server-only";

import { updateTag } from "next/cache";

import type { CacheInvalidator } from "@/application/ports/providers";

// `updateTag` expires the tag immediately (read-your-own-writes), which is
// what an editor expects after pressing Save. It only works inside Server
// Actions; every current admin mutation runs in one.
export class NextCacheInvalidator implements CacheInvalidator {
  async invalidate(tags: readonly string[]) {
    for (const tag of new Set(tags)) updateTag(tag);
  }
}
