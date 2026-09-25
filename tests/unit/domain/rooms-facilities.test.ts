import { describe, expect, it } from "vitest";

import { assertFacilityPublishable } from "@/domain/facilities/facility";
import {
  assertRoomPublishable,
  type RoomPublicationCandidate,
} from "@/domain/rooms/room";
import { DomainValidationError } from "@/domain/shared/domain-error";

const hero = {
  role: "HERO" as const,
  status: "READY" as const,
  altText: "Suite with river view",
};

const room: RoomPublicationCandidate = {
  id: "room-1",
  name: "River Suite",
  slug: "river-suite",
  shortDescription: "A calm suite above the Nile.",
  description: { type: "doc", content: [] },
  sizeSqm: 42,
  maxAdults: 2,
  maxChildren: 1,
  bedSummary: "King bed",
  viewSummary: "River",
  status: "DRAFT",
  media: [hero],
};

function issuesOf(action: () => void) {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainValidationError) return error.issues;
    throw error;
  }
  return [];
}

describe("room publish readiness", () => {
  it("accepts a complete room with one ready hero", () => {
    expect(() => assertRoomPublishable(room)).not.toThrow();
  });

  it.each([
    ["no hero", { media: [] }, "media"],
    ["two heroes", { media: [hero, hero] }, "media"],
    [
      "pending media",
      { media: [hero, { ...hero, role: "GALLERY", status: "PENDING" }] },
      "media.1",
    ],
    [
      "missing alt text",
      { media: [{ ...hero, altText: " " }] },
      "media.0.altText",
    ],
    ["invalid slug", { slug: "River Suite" }, "slug"],
    ["no adults", { maxAdults: 0 }, "maxAdults"],
    ["negative children", { maxChildren: -1 }, "maxChildren"],
    ["non-positive size", { sizeSqm: 0 }, "sizeSqm"],
    ["empty name", { name: "  " }, "name"],
  ] as const)("rejects %s", (_label, change, path) => {
    const issues = issuesOf(() =>
      assertRoomPublishable({ ...room, ...change } as RoomPublicationCandidate),
    );
    expect(issues.map((issue) => issue.path)).toContain(path);
  });

  it("uses an alt override when the asset alt text is empty", () => {
    expect(() =>
      assertRoomPublishable({
        ...room,
        media: [{ ...hero, altText: "", altOverride: "Suite at sunrise" }],
      }),
    ).not.toThrow();
  });
});

describe("facility publish readiness", () => {
  const facility = {
    id: "facility-1",
    name: "Pool",
    slug: "pool",
    shortDescription: "Outdoor pool terrace.",
    description: { type: "doc" as const, content: [] },
    openingHoursText: null,
    status: "DRAFT" as const,
    media: [hero],
  };

  it("accepts a complete facility", () => {
    expect(() => assertFacilityPublishable(facility)).not.toThrow();
  });

  it("requires exactly one ready hero and ready media", () => {
    expect(
      issuesOf(() => assertFacilityPublishable({ ...facility, media: [] })),
    ).toEqual([
      {
        path: "media",
        message: "A published facility requires exactly one ready hero image.",
      },
    ]);
    expect(
      issuesOf(() =>
        assertFacilityPublishable({
          ...facility,
          media: [{ ...hero, status: "FAILED" }],
        }),
      ).map((issue) => issue.path),
    ).toEqual(["media", "media.0"]);
  });
});
