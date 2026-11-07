// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({ branches: [] as unknown[] }));
vi.mock("@/composition/public", () => ({
  getPublicOrigin: () => "https://rivana.example",
  getPublicSitemap: async () => data.branches,
}));

import sitemap from "@/app/sitemap";

const page = (updatedAt: string) => ({ updatedAt });
const branch = (slug: string) => ({
  branch: { slug, updatedAt: "2026-11-07T00:00:00.000Z" },
  home: page("2026-11-01T00:00:00.000Z"),
  about: null,
  contact: page("2026-11-02T00:00:00.000Z"),
  rooms: [
    { slug: `${slug}-room`, updatedAt: "2026-11-03T00:00:00.000Z", hero: null },
  ],
  facilities: [],
});

// AC-8: only active branches and published content; `/` only as the chooser.
describe("sitemap per branch", () => {
  it("lists one branch's published pages without the redirecting root", async () => {
    data.branches = [branch("new-cairo")];
    expect((await sitemap()).map((entry) => entry.url)).toEqual([
      "https://rivana.example/new-cairo",
      "https://rivana.example/new-cairo/stay",
      "https://rivana.example/new-cairo/stay/new-cairo-room",
      "https://rivana.example/new-cairo/contact",
    ]);
  });

  it("adds the chooser and every branch when two are active", async () => {
    data.branches = [branch("new-cairo"), branch("demo-giza")];
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls[0]).toBe("https://rivana.example/");
    expect(urls).toContain(
      "https://rivana.example/demo-giza/stay/demo-giza-room",
    );
  });

  it("is empty with no active branch", async () => {
    data.branches = [];
    expect(await sitemap()).toEqual([]);
  });
});
