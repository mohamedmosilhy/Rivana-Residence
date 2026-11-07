import { describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import { PageCommands } from "@/application/content/page-commands";
import type { PageDto, PageRepository } from "@/application/ports/repositories";
import { success } from "@/application/shared/result";

import { branchRow, fakeBranches } from "../../support/fake-branches";

const now = new Date("2026-09-25T12:00:00Z");
const editor: StaffPrincipal = {
  id: "e",
  name: "Omar",
  email: "o@example.test",
  role: "EDITOR",
  sessionId: "s",
  branchIds: [],
};

function page(isPublished: boolean, branchId = "branch-1"): PageDto {
  return {
    id: "page-1",
    branchId,
    key: "ABOUT",
    title: "About",
    canonicalPath: "/about",
    isPublished,
    seoTitle: null,
    seoDescription: null,
    ogMediaId: null,
    updatedAt: now,
    sections: [
      "HERO",
      "IMAGE_TEXT_SPLIT",
      "STATS",
      "GALLERY",
      "CONTACT_CTA",
    ].map((type, index) => ({
      id: `s${index}`,
      type: type as PageDto["sections"][number]["type"],
      heading: null,
      eyebrow: null,
      payload: {},
      sortOrder: index,
      isVisible: true,
      media: [],
    })),
  };
}

function setup(isPublished: boolean) {
  const repository = {
    findAdminByKey: vi.fn(async (branchId: string) =>
      page(isPublished, branchId),
    ),
    reorderSections: vi.fn(async () => success(undefined)),
    updateDetails: vi.fn(async () => success(page(isPublished))),
    publish: vi.fn(async () => success(page(isPublished))),
    unpublish: vi.fn(async () => success(page(isPublished))),
    saveSection: vi.fn(async () => success(page(isPublished))),
  };
  const cache = { invalidate: vi.fn(async () => undefined) };
  const { repository: branches } = fakeBranches([
    branchRow(),
    branchRow({
      id: "branch-2",
      slug: "demo-giza",
      name: "Giza",
      sortOrder: 1,
    }),
  ]);
  return {
    repository,
    cache,
    commands: new PageCommands(
      repository as unknown as PageRepository,
      cache,
      branches,
    ),
  };
}

describe("page commands per branch (spec 0002)", () => {
  it("moves a section by swapping it with its neighbour", async () => {
    const { commands, repository } = setup(false);
    await commands.moveSection(editor, "new-cairo", "ABOUT", "s3", -1);
    expect(repository.reorderSections).toHaveBeenCalledWith(
      "page-1",
      ["s0", "s1", "s3", "s2", "s4"],
      editor,
    );
  });

  // T-SITE-4: only the edited branch's page tag expires.
  it("invalidates the branch's page tag only when the page is public", async () => {
    const draft = setup(false);
    await draft.commands.moveSection(editor, "new-cairo", "ABOUT", "s2", 1);
    expect(draft.cache.invalidate).not.toHaveBeenCalled();

    const live = setup(true);
    await live.commands.moveSection(editor, "demo-giza", "ABOUT", "s2", 1);
    expect(live.cache.invalidate).toHaveBeenCalledWith([
      "branch:demo-giza:page:about",
      "sitemap",
    ]);
  });

  it("publishing refreshes the branch page and the sitemap", async () => {
    const { commands, cache, repository } = setup(false);
    await commands.publish(editor, "demo-giza", "ABOUT");
    expect(repository.publish).toHaveBeenCalledWith(
      "branch-2",
      "ABOUT",
      editor,
    );
    expect(cache.invalidate).toHaveBeenCalledWith([
      "branch:demo-giza:page:about",
      "sitemap",
    ]);
  });

  // AC-13: a write never falls back to another branch.
  it("refuses a write for an unknown branch without touching pages", async () => {
    const { commands, repository } = setup(true);
    expect(await commands.publish(editor, "luxor", "ABOUT")).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it("validates search details before saving", async () => {
    const { commands, repository } = setup(false);
    expect(
      await commands.updateDetails(editor, "new-cairo", "ABOUT", {
        seoTitle: "x".repeat(71),
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(repository.updateDetails).not.toHaveBeenCalled();
  });

  it("keeps each section's stored type when saving", async () => {
    const { commands, repository } = setup(false);
    await commands.saveSection(editor, "new-cairo", "ABOUT", "s0", {
      payload: JSON.stringify({ title: "Our story", summary: "Since 2020." }),
      isVisible: "on",
      heading: "",
    });
    expect(repository.saveSection).toHaveBeenCalledWith(
      "branch-1",
      "ABOUT",
      expect.objectContaining({
        id: "s0",
        type: "HERO",
        heading: null,
        isVisible: true,
      }),
      editor,
    );
  });

  // AC-13: the selector falls back to the first branch when ?branch= is absent.
  it("lists the selected branch's pages, defaulting to the first branch", async () => {
    const { commands, repository } = setup(false);
    const fallback = await commands.list(editor, undefined);
    expect(fallback.ok && fallback.value.branchChoice.selected?.slug).toBe(
      "new-cairo",
    );
    const chosen = await commands.get(editor, "demo-giza", "ABOUT");
    expect(chosen.ok && chosen.value?.branch.slug).toBe("demo-giza");
    expect(repository.findAdminByKey).toHaveBeenLastCalledWith(
      "branch-2",
      "ABOUT",
    );
    expect(chosen.ok && chosen.value?.lockedTypes).toEqual([
      "HERO",
      "IMAGE_TEXT_SPLIT",
      "CONTACT_CTA",
    ]);
  });
});
