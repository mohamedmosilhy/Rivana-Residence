import { describe, expect, it } from "vitest";

import {
  assertPagePublishable,
  assertSectionOrder,
  assertSectionVisibilityAllowed,
  isSectionLocked,
  parsePageSectionPayload,
  type PageSectionDraft,
} from "@/domain/content/page-sections";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { slugSchema, slugify } from "@/domain/shared/slug";

import { defaultSections } from "../../../prisma/seed-data";

describe("slugs", () => {
  it.each([
    ["Nile Suite", "nile-suite"],
    ["  Café & Spa!  ", "cafe-and-spa"],
    ["Room -- 2", "room-2"],
    ["شقة", ""],
  ])("suggests %o → %o", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("caps suggestions at 120 characters without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(119)} b`);
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug.endsWith("-")).toBe(false);
  });

  it.each([
    "Nile-Suite",
    "nile suite",
    "-nile",
    "nile--suite",
    "",
    "nile/suite",
  ])("rejects the address %o", (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false);
  });
});

describe("page section policy", () => {
  it("locks each page's required sections visible", () => {
    expect(isSectionLocked("HOME", "ROOM_GRID")).toBe(true);
    expect(isSectionLocked("HOME", "GALLERY")).toBe(false);
    expect(() =>
      assertSectionVisibilityAllowed("ABOUT", "IMAGE_TEXT_SPLIT", false),
    ).toThrow("cannot be hidden");
    expect(() =>
      assertSectionVisibilityAllowed("ABOUT", "STATS", false),
    ).not.toThrow();
    expect(() =>
      assertSectionVisibilityAllowed("HOME", "HERO", true),
    ).not.toThrow();
  });

  it("keeps the Hero first and the Contact block last", () => {
    expect(() =>
      assertSectionOrder("HOME", [
        "HERO",
        "GALLERY",
        "ROOM_GRID",
        "CONTACT_CTA",
      ]),
    ).not.toThrow();
    expect(() =>
      assertSectionOrder("HOME", ["GALLERY", "HERO", "CONTACT_CTA"]),
    ).toThrow(DomainValidationError);
    expect(() =>
      assertSectionOrder("ABOUT", ["HERO", "CONTACT_CTA", "STATS"]),
    ).toThrow(DomainValidationError);
  });

  it("requires the About story and an enabled Contact form", () => {
    const hero = {
      type: "HERO",
      isVisible: true,
      payload: { schemaVersion: 1, title: "T", summary: "S" },
    } as const;
    const contact = (formEnabled: boolean): PageSectionDraft => ({
      type: "CONTACT_CTA",
      isVisible: true,
      payload: { schemaVersion: 1, body: "Write", formEnabled },
    });
    expect(() => assertPagePublishable("ABOUT", [hero, contact(true)])).toThrow(
      "missing required visible sections",
    );
    expect(() =>
      assertPagePublishable("CONTACT", [hero, contact(false)]),
    ).toThrow("missing required visible sections");
    expect(() =>
      assertPagePublishable("CONTACT", [hero, contact(true)]),
    ).not.toThrow();
  });
});

describe("seeded page sections", () => {
  it.each(["HOME", "ABOUT", "CONTACT"] as const)(
    "gives %s valid payloads, the approved order, and every required section visible",
    (key) => {
      const sections = defaultSections[key];
      for (const section of sections) {
        expect(() =>
          parsePageSectionPayload(key, section.type, section.payload),
        ).not.toThrow();
        if (isSectionLocked(key, section.type))
          expect(section.isVisible).toBe(true);
      }
      expect(() =>
        assertSectionOrder(
          key,
          sections.map((section) => section.type),
        ),
      ).not.toThrow();
      expect(() => assertPagePublishable(key, sections)).not.toThrow();
    },
  );
});
