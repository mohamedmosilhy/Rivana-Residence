import { describe, expect, it } from "vitest";

import {
  assertPagePublishable,
  parsePageSectionPayload,
  type PageSectionDraft,
} from "@/domain/content/page-sections";
import { DomainValidationError } from "@/domain/shared/domain-error";

const hero: PageSectionDraft = {
  type: "HERO",
  isVisible: true,
  payload: { schemaVersion: 1, title: "Rivana", summary: "By the river." },
};
const richText: PageSectionDraft = {
  type: "RICH_TEXT",
  isVisible: true,
  payload: { schemaVersion: 1, document: { type: "doc", content: [] } },
};
const roomGrid: PageSectionDraft = {
  type: "ROOM_GRID",
  isVisible: true,
  payload: { schemaVersion: 1, limit: 3, featuredOnly: true },
};
const facilityGrid: PageSectionDraft = {
  type: "FACILITY_GRID",
  isVisible: true,
  payload: { schemaVersion: 1, limit: 3, featuredOnly: false },
};
const contact: PageSectionDraft = {
  type: "CONTACT_CTA",
  isVisible: true,
  payload: { schemaVersion: 1, body: "Write to us.", formEnabled: true },
};

describe("page section payloads", () => {
  it("parses a valid payload", () => {
    expect(parsePageSectionPayload("HOME", "HERO", hero.payload)).toEqual(
      hero.payload,
    );
  });

  it("rejects section types not allowed on the page", () => {
    expect(() =>
      parsePageSectionPayload("CONTACT", "STATS", {
        schemaVersion: 1,
        items: [{ value: "12", label: "Rooms" }],
      }),
    ).toThrowError("STATS is not allowed on CONTACT.");
  });

  it("rejects invalid payloads with field paths", () => {
    try {
      parsePageSectionPayload("HOME", "ROOM_GRID", {
        schemaVersion: 1,
        limit: 40,
        featuredOnly: true,
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValidationError);
      expect((error as DomainValidationError).issues[0]?.path).toBe("limit");
    }
  });

  it("rejects unknown schema versions", () => {
    expect(() =>
      parsePageSectionPayload("HOME", "HERO", {
        ...(hero.payload as object),
        schemaVersion: 2,
      }),
    ).toThrow(DomainValidationError);
  });
});

describe("page publish readiness", () => {
  it("accepts a complete home page", () => {
    expect(() =>
      assertPagePublishable("HOME", [
        hero,
        richText,
        roomGrid,
        facilityGrid,
        contact,
      ]),
    ).not.toThrow();
  });

  it("accepts an image/text split in place of rich text on home", () => {
    expect(() =>
      assertPagePublishable("HOME", [
        hero,
        {
          type: "IMAGE_TEXT_SPLIT",
          isVisible: true,
          payload: {
            schemaVersion: 1,
            body: { type: "doc", content: [] },
            imageSide: "LEFT",
          },
        },
        roomGrid,
        facilityGrid,
        contact,
      ]),
    ).not.toThrow();
  });

  it("does not count hidden sections toward requirements", () => {
    expect(() =>
      assertPagePublishable("CONTACT", [
        hero,
        { ...contact, isVisible: false },
      ]),
    ).toThrowError("CONTACT is missing required visible sections.");
  });

  it("ignores invalid payloads on hidden sections", () => {
    expect(() =>
      assertPagePublishable("CONTACT", [
        hero,
        contact,
        { type: "RICH_TEXT", isVisible: false, payload: {} },
      ]),
    ).not.toThrow();
  });

  it("lists every missing home section", () => {
    try {
      assertPagePublishable("HOME", [hero]);
      expect.unreachable();
    } catch (error) {
      expect(
        (error as DomainValidationError).issues.map((issue) => issue.message),
      ).toEqual([
        "A visible ROOM_GRID section is required.",
        "A visible FACILITY_GRID section is required.",
        "A visible CONTACT_CTA section is required.",
        "A visible RICH_TEXT section is required.",
      ]);
    }
  });
});
