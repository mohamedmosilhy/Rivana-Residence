import { describe, expect, it } from "vitest";

import {
  isPromotionActive,
  nextPromotionVersion,
  promotionDraftSchema,
  selectActivePromotion,
  type PromotionCandidate,
} from "@/domain/promotions/promotion";

const now = new Date("2026-10-01T12:00:00Z");
const at = (offsetHours: number) =>
  new Date(now.getTime() + offsetHours * 60 * 60 * 1000);

const base: PromotionCandidate = {
  id: "a",
  status: "PUBLISHED",
  startsAt: null,
  endsAt: null,
  priority: 0,
  showAsPopup: true,
  publishedAt: at(-1),
};

describe("promotion draft rules", () => {
  const draft = {
    internalName: "Autumn",
    headline: "Autumn by the river",
    body: "Stay three nights.",
    code: "AUTUMN-26",
    terms: null,
    startsAt: at(0),
    endsAt: at(24),
    priority: 10,
    showAsPopup: true,
  };

  it("accepts a valid promotion", () => {
    expect(promotionDraftSchema.safeParse(draft).success).toBe(true);
  });

  it.each([
    ["an end before the start", { endsAt: at(-1) }],
    ["an end equal to the start", { endsAt: at(0) }],
    ["a code with spaces", { code: "AUTUMN 26" }],
    ["a code starting with a dash", { code: "-AUTUMN" }],
    ["out-of-range priority", { priority: 1001 }],
  ])("rejects %s", (_label, change) => {
    expect(
      promotionDraftSchema.safeParse({ ...draft, ...change }).success,
    ).toBe(false);
  });
});

describe("promotion scheduling", () => {
  it.each([
    ["published with open window", {}, true],
    ["draft", { status: "DRAFT" }, false],
    ["archived", { status: "ARCHIVED" }, false],
    ["not a popup", { showAsPopup: false }, false],
    ["starting now", { startsAt: now }, true],
    ["starting later", { startsAt: at(1) }, false],
    ["ending now", { endsAt: now }, false],
    ["ending later", { endsAt: at(1) }, true],
  ] as const)("%s → %s", (_label, change, expected) => {
    expect(isPromotionActive({ ...base, ...change }, now)).toBe(expected);
  });

  it("selects the highest priority, then latest publication, then id", () => {
    const promotions: PromotionCandidate[] = [
      { ...base, id: "low", priority: 1 },
      { ...base, id: "older", priority: 5, publishedAt: at(-3) },
      { ...base, id: "newer-b", priority: 5, publishedAt: at(-2) },
      { ...base, id: "newer-a", priority: 5, publishedAt: at(-2) },
      { ...base, id: "inactive", priority: 99, status: "DRAFT" },
    ];

    expect(selectActivePromotion(promotions, now)?.id).toBe("newer-a");
  });

  it("returns null when nothing is active", () => {
    expect(
      selectActivePromotion([{ ...base, status: "DRAFT" }], now),
    ).toBeNull();
  });

  it("does not mutate its input", () => {
    const promotions = [
      { ...base, id: "b", priority: 1 },
      { ...base, id: "a", priority: 2 },
    ];
    selectActivePromotion(promotions, now);
    expect(promotions.map((promotion) => promotion.id)).toEqual(["b", "a"]);
  });
});

describe("promotion versioning", () => {
  const content = {
    headline: "Autumn",
    body: "Stay",
    code: "AUTUMN",
    terms: null,
    showAsPopup: true,
  };

  it("bumps the version only when public content changes", () => {
    expect(nextPromotionVersion(3, content, { ...content })).toBe(3);
    expect(nextPromotionVersion(3, content, { ...content, code: "FALL" })).toBe(
      4,
    );
  });
});
