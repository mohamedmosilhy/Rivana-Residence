import { describe, expect, it } from "vitest";

import {
  facilityInputFromForm,
  entityMediaFromForm,
  sectionMediaFromForm,
  roomInputFromForm,
} from "@/application/content/catalog-forms";
import {
  pageKeyFromSegment,
  sectionPayloadFromForm,
} from "@/application/content/page-commands";
import { promotionInputFromForm } from "@/application/promotions/promotion-admin";
import { facilityDraftSchema } from "@/domain/facilities/facility";
import { promotionDraftSchema } from "@/domain/promotions/promotion";
import { roomDraftSchema } from "@/domain/rooms/room";

const roomForm = {
  name: "Nile Suite",
  slug: "nile-suite",
  shortDescription: "Wide windows.",
  description: "First paragraph.\n\nSecond.",
  sizeSqm: "48.5",
  maxAdults: "2",
  maxChildren: "",
  bedSummary: " ",
  viewSummary: "Nile",
  features: JSON.stringify([{ label: "Balcony" }, { label: "Rain shower" }]),
  featured: "on",
  seoTitle: "",
  seoDescription: "Stay by the Nile.",
};

describe("room and facility forms", () => {
  it("shapes room form text into a valid draft", () => {
    const input = roomInputFromForm(roomForm);
    expect(input).toMatchObject({
      sizeSqm: 48.5,
      maxAdults: 2,
      maxChildren: 0,
      bedSummary: null,
      featured: true,
      seoTitle: null,
      features: [{ label: "Balcony" }, { label: "Rain shower" }],
    });
    expect(input.description.content).toHaveLength(2);
    expect(roomDraftSchema.safeParse(input).success).toBe(true);
  });

  it("lets the schema report malformed numbers next to their fields", () => {
    const result = roomDraftSchema.safeParse(
      roomInputFromForm({ ...roomForm, sizeSqm: "big", maxAdults: "" }),
    );
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(["sizeSqm", "maxAdults"]),
    );
  });

  it("treats a malformed feature list as no features", () => {
    expect(
      roomInputFromForm({ ...roomForm, features: "{oops" }).features,
    ).toEqual([]);
  });

  it("never carries price, availability, or booking input into a draft", () => {
    const forbidden = {
      price: "120",
      rate: "99",
      availability: "yes",
      reservationUrl: "https://example.test",
      discount: "10",
    };
    const room = roomDraftSchema.parse(
      roomInputFromForm({ ...roomForm, ...forbidden }),
    );
    const facility = facilityDraftSchema.parse(
      facilityInputFromForm({ ...roomForm, ...forbidden }),
    );
    for (const draft of [room, facility]) {
      expect(Object.keys(draft)).not.toEqual(
        expect.arrayContaining(Object.keys(forbidden)),
      );
    }
    const schemaKeys = [
      ...Object.keys(roomDraftSchema.shape),
      ...Object.keys(facilityDraftSchema.shape),
    ];
    expect(
      schemaKeys.filter((key) =>
        /price|rate|avail|reserv|book|discount|payment/i.test(key),
      ),
    ).toEqual([]);
  });

  it("builds hero, ordered gallery, alt overrides, and the sharing image", () => {
    expect(
      entityMediaFromForm({
        media: JSON.stringify({
          hero: { mediaId: "hero", altOverride: "  Balcony at dusk " },
          gallery: [
            { mediaId: "g1", altOverride: "" },
            { mediaId: "g2", altOverride: null },
            { mediaId: "g1", altOverride: null },
          ],
          social: { mediaId: "og", altOverride: null },
        }),
      }),
    ).toEqual({
      ok: true,
      value: {
        assignments: [
          {
            mediaId: "hero",
            role: "HERO",
            sortOrder: 0,
            altOverride: "Balcony at dusk",
          },
          { mediaId: "g1", role: "GALLERY", sortOrder: 0, altOverride: null },
          { mediaId: "g2", role: "GALLERY", sortOrder: 1, altOverride: null },
        ],
        socialImageId: "og",
      },
    });
  });

  it.each([
    [{ media: "not json" }],
    [{ media: JSON.stringify({ gallery: [{ mediaId: 1 }] }) }],
    [{ media: JSON.stringify({ hero: { mediaId: "../etc" } }) }],
    [
      {
        media: JSON.stringify({
          hero: { mediaId: "a", altOverride: "x".repeat(301) },
        }),
      },
    ],
    [
      {
        media: JSON.stringify({
          hero: { mediaId: "a" },
          gallery: [{ mediaId: "a" }],
        }),
      },
    ],
    [
      {
        media: JSON.stringify({
          gallery: Array.from({ length: 25 }, (_, i) => ({ mediaId: `m${i}` })),
        }),
      },
    ],
  ])("rejects an invalid image selection %#", (values) => {
    expect(entityMediaFromForm(values).ok).toBe(false);
  });

  it("reads section images per role and rejects unknown roles", () => {
    expect(
      sectionMediaFromForm({
        media: JSON.stringify({
          GALLERY: [{ mediaId: "a" }, { mediaId: "b", altOverride: "Pool" }],
        }),
      }),
    ).toEqual({
      ok: true,
      value: [
        { mediaId: "a", altOverride: null, role: "GALLERY", sortOrder: 0 },
        { mediaId: "b", altOverride: "Pool", role: "GALLERY", sortOrder: 1 },
      ],
    });
    expect(
      sectionMediaFromForm({
        media: JSON.stringify({ HERO: [{ mediaId: "a" }] }),
      }).ok,
    ).toBe(false);
  });
});

describe("promotion form", () => {
  const form = {
    internalName: "Autumn",
    headline: "Autumn by the river",
    body: "Stay longer.",
    code: "AUTUMN26",
    terms: "",
    startsAt: "2026-10-01T09:00",
    endsAt: "",
    priority: "5",
    showAsPopup: "on",
  };

  it("reads schedule times in the property time zone", () => {
    const result = promotionInputFromForm(form, "Africa/Cairo");
    expect(result).toMatchObject({
      ok: true,
      value: {
        terms: null,
        startsAt: new Date("2026-10-01T06:00:00.000Z"),
        endsAt: null,
        priority: 5,
        showAsPopup: true,
      },
    });
    expect(
      result.ok && promotionDraftSchema.safeParse(result.value).success,
    ).toBe(true);
  });

  it("rejects a malformed time instead of treating it as no limit", () => {
    expect(
      promotionInputFromForm(
        { ...form, endsAt: "2026-02-31T10:00" },
        "Africa/Cairo",
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { endsAt: [expect.any(String)] },
      },
    });
  });

  it("has no discount, redemption, guest, or reservation fields", () => {
    expect(Object.keys(promotionDraftSchema.shape)).toContain("code");
    expect(
      Object.keys(promotionDraftSchema.shape).filter((key) =>
        /discount|amount|redeem|redemption|guest|reserv|payment|eligib/i.test(
          key,
        ),
      ),
    ).toEqual([]);
  });
});

describe("page section forms", () => {
  it("maps URL segments to page keys", () => {
    expect(pageKeyFromSegment("home")).toBe("HOME");
    expect(pageKeyFromSegment("staff")).toBeNull();
  });

  it("converts editor text to documents and forces the schema version", () => {
    expect(
      sectionPayloadFromForm("RICH_TEXT", {
        documentText: "Hi",
        schemaVersion: 99,
      }),
    ).toEqual({
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Hi" }] },
        ],
      },
    });
  });

  it("drops a button with no text and parses numbers", () => {
    expect(
      sectionPayloadFromForm("HERO", {
        title: "T",
        summary: "S",
        cta: { label: "  ", intent: "CONTACT" },
      }),
    ).toEqual({ schemaVersion: 1, title: "T", summary: "S" });
    expect(
      sectionPayloadFromForm("ROOM_GRID", { limit: "4", featuredOnly: true }),
    ).toEqual({
      schemaVersion: 1,
      limit: 4,
      featuredOnly: true,
    });
  });

  it("ignores unknown keys and rejects non-object payloads", () => {
    expect(
      sectionPayloadFromForm("GALLERY", { layout: "GRID", html: "<iframe>" }),
    ).toEqual({ schemaVersion: 1, layout: "GRID" });
    expect(sectionPayloadFromForm("HERO", "<b>hi</b>")).toBeNull();
    expect(sectionPayloadFromForm("HERO", [1])).toBeNull();
  });
});
