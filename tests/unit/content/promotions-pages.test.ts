import { describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import { PageCommands } from "@/application/content/page-commands";
import type {
  PageDto,
  PageRepository,
  PromotionDto,
  PromotionRepository,
} from "@/application/ports/repositories";
import {
  PromotionAdmin,
  explainPromotionDisplay,
  parsePromotionListQuery,
  promotionTiming,
} from "@/application/promotions/promotion-admin";
import { success } from "@/application/shared/result";

const now = new Date("2026-09-25T12:00:00Z");
const hours = (offset: number) => new Date(now.getTime() + offset * 3_600_000);

const editor: StaffPrincipal = {
  id: "e",
  name: "Omar",
  email: "o@example.test",
  role: "EDITOR",
  sessionId: "s",
};
const admin: StaffPrincipal = { ...editor, id: "a", role: "ADMIN" };

function promotion(
  id: string,
  overrides: Partial<PromotionDto> = {},
): PromotionDto {
  return {
    id,
    internalName: `Campaign ${id}`,
    headline: "Headline",
    body: "Body",
    code: "CODE",
    terms: null,
    status: "PUBLISHED",
    startsAt: null,
    endsAt: null,
    priority: 0,
    showAsPopup: true,
    version: 1,
    publishedAt: hours(-24),
    updatedAt: hours(-1),
    ...overrides,
  };
}

describe("promotion display explanation", () => {
  it("reports the public winner as showing", () => {
    const a = promotion("a", { priority: 5 });
    expect(explainPromotionDisplay(a, [a, promotion("b")], now)).toEqual({
      state: "showing",
    });
  });

  it("names the promotion that outranks a published one", () => {
    const low = promotion("low", { priority: 1 });
    const high = promotion("high", { priority: 5 });
    expect(explainPromotionDisplay(low, [low, high], now)).toEqual({
      state: "outranked",
      winner: high,
    });
  });

  it("judges a draft as if published now, which wins ties", () => {
    const live = promotion("live", { priority: 2 });
    const tie = promotion("draft", {
      status: "DRAFT",
      priority: 2,
      publishedAt: null,
    });
    expect(explainPromotionDisplay(tie, [live, tie], now)).toEqual({
      state: "would-show",
    });
    const lower = { ...tie, priority: 1 };
    expect(explainPromotionDisplay(lower, [live, lower], now)).toEqual({
      state: "would-be-outranked",
      winner: live,
    });
  });

  it.each([
    [{ status: "ARCHIVED" as const }, "archived"],
    [{ showAsPopup: false }, "popup-off"],
    [{ endsAt: hours(-1) }, "expired"],
    [{ startsAt: hours(3) }, "scheduled"],
  ])("explains %o as %s", (overrides, state) => {
    const item = promotion("x", overrides);
    expect(explainPromotionDisplay(item, [item], now).state).toBe(state);
  });

  it("classifies timing by window only", () => {
    expect(promotionTiming({ startsAt: null, endsAt: null }, now)).toBe(
      "active",
    );
    expect(promotionTiming({ startsAt: hours(1), endsAt: null }, now)).toBe(
      "scheduled",
    );
    expect(promotionTiming({ startsAt: null, endsAt: now }, now)).toBe(
      "expired",
    );
  });

  it("parses list filters safely", () => {
    expect(
      parsePromotionListQuery({
        status: "PUBLISHED",
        timing: "expired",
        q: " x ",
      }),
    ).toMatchObject({
      status: "PUBLISHED",
      timing: "expired",
      search: "x",
    });
    expect(parsePromotionListQuery({ timing: "soon" }).timing).toBeNull();
  });
});

describe("promotion commands", () => {
  function setup(items: PromotionDto[]) {
    const repository = {
      listAdmin: vi.fn(async () => items),
      findAdminById: vi.fn(
        async (id: string) => items.find((item) => item.id === id) ?? null,
      ),
      publish: vi.fn(async (id: string) =>
        success(items.find((item) => item.id === id)!),
      ),
      delete: vi.fn(async () => success(undefined)),
      archive: vi.fn(async () => success(undefined)),
    };
    const cache = { invalidate: vi.fn(async () => undefined) };
    return {
      repository,
      cache,
      admin: new PromotionAdmin(
        repository as unknown as PromotionRepository,
        cache,
        {
          now: () => now,
        },
      ),
    };
  }

  it("publishes at server time and invalidates the active promotion", async () => {
    const { admin: commands, repository, cache } = setup([promotion("a")]);
    await commands.publish(editor, "a");
    expect(repository.publish).toHaveBeenCalledWith("a", editor, now);
    expect(cache.invalidate).toHaveBeenCalledWith(["promotion:active"]);
  });

  it("lets editors archive but only administrators delete", async () => {
    const { admin: commands, repository } = setup([
      promotion("a", { status: "ARCHIVED" }),
    ]);
    expect((await commands.archive(editor, "a")).ok).toBe(true);
    expect(await commands.delete(editor, "a")).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(repository.delete).not.toHaveBeenCalled();
    expect((await commands.delete(admin, "a")).ok).toBe(true);
  });

  it("filters the list by status, timing, and search", async () => {
    const { admin: commands } = setup([
      promotion("live"),
      promotion("soon", { startsAt: hours(5), internalName: "Winter" }),
      promotion("gone", { status: "ARCHIVED" }),
    ]);
    const all = await commands.list(editor, {});
    expect(all.ok && all.value.items.map((item) => item.id)).toEqual([
      "live",
      "soon",
    ]);
    const scheduled = await commands.list(editor, { timing: "scheduled" });
    expect(
      scheduled.ok && scheduled.value.items.map((item) => item.id),
    ).toEqual(["soon"]);
    const search = await commands.list(editor, { q: "winter" });
    expect(search.ok && search.value.total).toBe(1);
  });
});

describe("page commands", () => {
  function page(isPublished: boolean): PageDto {
    return {
      id: "page-1",
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
    const current = page(isPublished);
    const repository = {
      findAdminByKey: vi.fn(async () => current),
      reorderSections: vi.fn(async () => success(undefined)),
      updateDetails: vi.fn(async () => success(current)),
      publish: vi.fn(async () => success(current)),
      unpublish: vi.fn(async () => success(current)),
      saveSection: vi.fn(async () => success(current)),
    };
    const cache = { invalidate: vi.fn(async () => undefined) };
    return {
      repository,
      cache,
      commands: new PageCommands(
        repository as unknown as PageRepository,
        cache,
      ),
    };
  }

  it("moves a section by swapping it with its neighbour", async () => {
    const { commands, repository } = setup(false);
    await commands.moveSection(editor, "ABOUT", "s3", -1);
    expect(repository.reorderSections).toHaveBeenCalledWith(
      "page-1",
      ["s0", "s1", "s3", "s2", "s4"],
      editor,
    );
  });

  it("invalidates the page only when it is public", async () => {
    const draft = setup(false);
    await draft.commands.moveSection(editor, "ABOUT", "s2", 1);
    expect(draft.cache.invalidate).not.toHaveBeenCalled();

    const live = setup(true);
    await live.commands.moveSection(editor, "ABOUT", "s2", 1);
    expect(live.cache.invalidate).toHaveBeenCalledWith(["page:about"]);
  });

  it("publishing refreshes the page and the sitemap", async () => {
    const { commands, cache } = setup(false);
    await commands.publish(editor, "ABOUT");
    expect(cache.invalidate).toHaveBeenCalledWith(["page:about", "sitemap"]);
  });

  it("validates search details before saving", async () => {
    const { commands, repository } = setup(false);
    expect(
      await commands.updateDetails(editor, "ABOUT", {
        seoTitle: "x".repeat(71),
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(repository.updateDetails).not.toHaveBeenCalled();
  });

  it("keeps each section's stored type when saving", async () => {
    const { commands, repository } = setup(false);
    await commands.saveSection(editor, "ABOUT", "s0", {
      payload: JSON.stringify({ title: "Our story", summary: "Since 2020." }),
      isVisible: "on",
      heading: "",
    });
    expect(repository.saveSection).toHaveBeenCalledWith(
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

  it("reports the readiness of each page", async () => {
    const { commands } = setup(false);
    const result = await commands.get(editor, "ABOUT");
    expect(result.ok && result.value?.readiness.length).toBeGreaterThan(0);
    expect(result.ok && result.value?.lockedTypes).toEqual([
      "HERO",
      "IMAGE_TEXT_SPLIT",
      "CONTACT_CTA",
    ]);
  });
});
