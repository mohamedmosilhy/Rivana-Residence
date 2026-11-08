import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NextCacheInvalidator,
  NextRouteCacheInvalidator,
} from "@/infrastructure/cache/next-cache-invalidator";

const cache = vi.hoisted(() => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/cache", () => cache);

beforeEach(() => vi.clearAllMocks());

describe("cache invalidation at each transport boundary", () => {
  it("keeps immediate Server Action invalidation and expires each tag once", async () => {
    await new NextCacheInvalidator().invalidate([
      "branches",
      "sitemap",
      "branches",
    ]);

    expect(cache.updateTag.mock.calls).toEqual([["branches"], ["sitemap"]]);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
  });

  it("uses blocking expiry in Route Handlers without calling updateTag", async () => {
    await new NextRouteCacheInvalidator().invalidate([
      "branches",
      "sitemap",
      "branches",
    ]);

    expect(cache.revalidateTag.mock.calls).toEqual([
      ["branches", { expire: 0 }],
      ["sitemap", { expire: 0 }],
    ]);
    expect(cache.updateTag).not.toHaveBeenCalled();
  });
});
