import { describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import {
  CatalogCommands,
  ROOM_KIND,
  type CatalogRepository,
} from "@/application/content/catalog-commands";
import {
  filterCatalog,
  parseCatalogListQuery,
} from "@/application/content/catalog-queries";
import { failure, success } from "@/application/shared/result";
import type { PublicationStatus } from "@/domain/shared/types";

type Row = {
  id: string;
  name: string;
  slug: string;
  status: PublicationStatus;
  featured: boolean;
  media: { id: string; role: "HERO" | "GALLERY" }[];
};

const admin: StaffPrincipal = {
  id: "admin-1",
  name: "Amira",
  email: "a@example.test",
  role: "ADMIN",
  sessionId: "s",
};
const editor: StaffPrincipal = { ...admin, id: "editor-1", role: "EDITOR" };

function setup(rows: Row[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const repository = {
    listAdmin: vi.fn(async () => rows),
    findAdminById: vi.fn(async (id: string) => byId.get(id) ?? null),
    create: vi.fn(async () => success(rows[0]!)),
    update: vi.fn(async (id: string, input: { slug: string }) =>
      success({ ...byId.get(id)!, slug: input.slug }),
    ),
    publish: vi.fn(async (id: string) =>
      success({ ...byId.get(id)!, status: "PUBLISHED" }),
    ),
    unpublish: vi.fn(async (id: string) =>
      success({ ...byId.get(id)!, status: "DRAFT" }),
    ),
    archive: vi.fn(async () => success(undefined)),
    restore: vi.fn(async (id: string) =>
      success({ ...byId.get(id)!, status: "DRAFT" }),
    ),
    delete: vi.fn(async () => success(undefined)),
    reorder: vi.fn(async () => success(undefined)),
    replaceMedia: vi.fn(async (id: string) => success(byId.get(id)!)),
  };
  const cache = { invalidate: vi.fn(async () => undefined) };
  const commands = new CatalogCommands<Row, { slug: string }>(
    repository as unknown as CatalogRepository<Row, { slug: string }>,
    cache,
    ROOM_KIND,
  );
  return { repository, cache, commands };
}

const draft: Row = {
  id: "d",
  name: "Draft",
  slug: "draft-room",
  status: "DRAFT",
  featured: false,
  media: [],
};
const live: Row = {
  id: "p",
  name: "Live",
  slug: "live-room",
  status: "PUBLISHED",
  featured: true,
  media: [],
};
const old: Row = {
  id: "a",
  name: "Old",
  slug: "old-room",
  status: "ARCHIVED",
  featured: false,
  media: [],
};

describe("catalog cache invalidation", () => {
  it("leaves public caches alone for draft edits", async () => {
    const { commands, cache } = setup([draft]);
    await commands.update(editor, "d", { slug: "draft-room" });
    await commands.archive(editor, "d");
    await commands.restore(editor, "d");
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it("refreshes the list, page, and sitemap lastmod for a published edit", async () => {
    const { commands, cache } = setup([live]);
    await commands.update(editor, "p", { slug: "live-room" });
    expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith([
      "rooms",
      "room:live-room",
      "sitemap",
    ]);
  });

  it("refreshes both addresses and the sitemap when a published slug changes", async () => {
    const { commands, cache } = setup([live]);
    await commands.update(editor, "p", { slug: "river-room" });
    expect(cache.invalidate).toHaveBeenCalledWith([
      "rooms",
      "room:live-room",
      "room:river-room",
      "sitemap",
    ]);
  });

  it.each(["publish", "unpublish"] as const)(
    "%s refreshes list, page, and sitemap",
    async (operation) => {
      const { commands, cache } = setup([live, draft]);
      await commands[operation](editor, operation === "publish" ? "d" : "p");
      expect(cache.invalidate).toHaveBeenCalledWith([
        "rooms",
        `room:${operation === "publish" ? "draft-room" : "live-room"}`,
        "sitemap",
      ]);
    },
  );

  it("archiving a published room removes it from public caches", async () => {
    const { commands, cache } = setup([live]);
    await commands.archive(editor, "p");
    expect(cache.invalidate).toHaveBeenCalledWith([
      "rooms",
      "room:live-room",
      "sitemap",
    ]);
  });

  it("does not invalidate after a failed write", async () => {
    const { commands, cache, repository } = setup([live]);
    repository.publish.mockResolvedValueOnce(
      failure("NOT_PUBLISHABLE", "No hero."),
    );
    await commands.update(editor, "p", { slug: "live-room" });
    cache.invalidate.mockClear();
    repository.unpublish.mockResolvedValueOnce(
      failure("CONFLICT", "Not published."),
    );
    await commands.unpublish(editor, "p");
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
});

describe("catalog authorization and conflicts", () => {
  it("allows only administrators to delete permanently", async () => {
    const { commands, repository } = setup([old]);
    expect(await commands.delete(editor, "a")).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(repository.delete).not.toHaveBeenCalled();
    expect((await commands.delete(admin, "a")).ok).toBe(true);
  });

  it("refuses signed-out staff before touching the repository", async () => {
    const { commands, repository } = setup([draft]);
    expect(await commands.publish(null, "d")).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(repository.findAdminById).not.toHaveBeenCalled();
  });

  it("reports a missing record as not found", async () => {
    const { commands } = setup([draft]);
    expect(await commands.archive(editor, "missing")).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("explains a duplicate web address next to the slug field", async () => {
    const { commands, repository } = setup([draft]);
    repository.create.mockResolvedValueOnce(failure("CONFLICT", "Unique."));
    expect(await commands.create(editor, { slug: "draft-room" })).toMatchObject(
      {
        ok: false,
        error: {
          code: "CONFLICT",
          fieldErrors: {
            slug: [expect.stringContaining("already uses this web address")],
          },
        },
      },
    );
  });
});

describe("catalog ordering", () => {
  const rows: Row[] = [
    { ...draft, id: "1" },
    { ...old, id: "x" },
    { ...live, id: "2" },
    { ...draft, id: "3" },
  ];

  it("swaps with the active neighbour, skipping archived records", async () => {
    const { commands, repository, cache } = setup(rows);
    await commands.move(editor, "2", -1);
    expect(repository.reorder).toHaveBeenCalledWith(["2", "1", "3"], editor);
    expect(cache.invalidate).toHaveBeenCalledWith(["rooms", "sitemap"]);
  });

  it("does nothing at either end", async () => {
    const { commands, repository } = setup(rows);
    expect((await commands.move(editor, "1", -1)).ok).toBe(true);
    expect((await commands.move(editor, "3", 1)).ok).toBe(true);
    expect(repository.reorder).not.toHaveBeenCalled();
  });

  it("refuses to move archived or unknown records", async () => {
    const { commands } = setup(rows);
    expect((await commands.move(editor, "x", 1)).ok).toBe(false);
  });
});

describe("catalog list filtering", () => {
  const rows: Row[] = [live, draft, old];

  it("hides archived records unless asked for", () => {
    expect(filterCatalog(rows, parseCatalogListQuery({})).items).toEqual([
      live,
      draft,
    ]);
    expect(
      filterCatalog(rows, parseCatalogListQuery({ status: "ARCHIVED" })).items,
    ).toEqual([old]);
  });

  it("filters by featured and searches name or address", () => {
    expect(
      filterCatalog(rows, parseCatalogListQuery({ featured: "yes" })).items,
    ).toEqual([live]);
    expect(
      filterCatalog(rows, parseCatalogListQuery({ q: "DRAFT" })).items,
    ).toEqual([draft]);
    expect(
      filterCatalog(rows, parseCatalogListQuery({ q: "live-r" })).items,
    ).toEqual([live]);
  });

  it("allows reordering only on the unfiltered list", () => {
    expect(filterCatalog(rows, parseCatalogListQuery({})).reorderable).toBe(
      true,
    );
    expect(
      filterCatalog(rows, parseCatalogListQuery({ q: "x" })).reorderable,
    ).toBe(false);
    expect(filterCatalog(rows, parseCatalogListQuery({})).activeOrder).toEqual([
      "p",
      "d",
    ]);
  });

  it("ignores unknown filter values", () => {
    expect(
      parseCatalogListQuery({ status: "DELETED", featured: "maybe" }),
    ).toMatchObject({
      status: null,
      featured: null,
    });
  });
});

describe("content gaps", () => {
  it("flags missing and shared galleries without blocking anything", async () => {
    const { contentGaps } = await import(
      "@/application/content/catalog-queries"
    );
    const gallery = (...ids: string[]) =>
      ids.map((id) => ({ id, role: "GALLERY" as const }));
    const a = { ...draft, id: "a", name: "Studio", media: gallery("m1", "m2") };
    const b = { ...draft, id: "b", name: "Deluxe", media: gallery("m2") };
    const c = { ...draft, id: "c", name: "Empty", media: [] };
    const gone = { ...old, id: "x", media: gallery("m1") };

    expect(contentGaps(a, [a, b, c, gone], "room")).toEqual([
      "Shares 1 gallery image with Deluxe; each room should have its own photos.",
    ]);
    expect(contentGaps(c, [a, b, c], "room")).toEqual([
      "This room has no gallery images yet.",
    ]);
  });
});
