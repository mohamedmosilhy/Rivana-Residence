import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { RoomInput } from "@/application/content/ports";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";

import {
  actor,
  createActor,
  createMedia,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();
const rooms = new PrismaRoomRepository(client);
const facilities = new PrismaFacilityRepository(client);
const pages = new PrismaPageRepository(client);

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
});

const roomInput: RoomInput = {
  name: "Nile Suite",
  slug: "nile-suite",
  shortDescription: "Wide windows over the Nile.",
  description: { type: "doc", content: [{ type: "paragraph" }] },
  sizeSqm: 48.5,
  maxAdults: 2,
  maxChildren: 2,
  bedSummary: "King bed",
  viewSummary: "Nile",
  featured: true,
};

describe("room writes", () => {
  it("creates drafts appended after active rooms", async () => {
    await createRoom(client, { sortOrder: 4 });
    await createRoom(client, { sortOrder: 9, status: "ARCHIVED" });

    const result = await rooms.create(TEST_BRANCH_ID, roomInput, actor);

    expect(result).toMatchObject({
      ok: true,
      value: { status: "DRAFT", sortOrder: 5, sizeSqm: 48.5, featured: true },
    });
    expect(await rooms.listPublished(TEST_BRANCH_ID)).toEqual([]);
    expect(await rooms.listAdmin(TEST_BRANCH_ID)).toHaveLength(3);
  });

  it("returns field errors for invalid input", async () => {
    const result = await rooms.create(
      TEST_BRANCH_ID,
      { ...roomInput, slug: "Nile Suite", maxAdults: 0 },
      actor,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (result.ok) return;
    expect(Object.keys(result.error.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["slug", "maxAdults"]),
    );
  });

  it("reports duplicate slugs as conflicts", async () => {
    await rooms.create(TEST_BRANCH_ID, roomInput, actor);
    expect(await rooms.create(TEST_BRANCH_ID, roomInput, actor)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("updates rooms and keeps published rooms publishable", async () => {
    const hero = await createMedia(client);
    const room = await createRoom(client, {
      status: "PUBLISHED",
      heroMediaId: hero.id,
    });

    expect(
      await rooms.update(room.id, { ...roomInput, name: "Renamed" }, actor),
    ).toMatchObject({
      ok: true,
      value: { name: "Renamed", status: "PUBLISHED" },
    });
    expect(
      await rooms.update(
        room.id,
        { ...roomInput, shortDescription: " " },
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await rooms.update("missing", roomInput, actor)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

// T-CAT-1, T-CAT-2 (AC-5): the accommodation type and apartment counts are
// stored and read back; rooms default to ROOM.
describe("accommodation type", () => {
  it("defaults a listing to ROOM with no unit counts", async () => {
    const created = await rooms.create(TEST_BRANCH_ID, roomInput, actor);
    expect(created).toMatchObject({
      ok: true,
      value: {
        accommodationType: "ROOM",
        bedroomCount: null,
        bathroomCount: null,
      },
    });
  });

  it("stores an apartment with its bedrooms and bathrooms", async () => {
    const created = await rooms.create(
      TEST_BRANCH_ID,
      {
        ...roomInput,
        slug: "family-apartment",
        accommodationType: "APARTMENT",
        bedroomCount: 2,
        bathroomCount: 1,
      },
      actor,
    );
    if (!created.ok) throw new Error(created.error.message);
    expect(await rooms.findAdminById(created.value.id)).toMatchObject({
      accommodationType: "APARTMENT",
      bedroomCount: 2,
      bathroomCount: 1,
    });
    const changed = await rooms.update(
      created.value.id,
      { ...roomInput, slug: "family-apartment", accommodationType: "ROOM" },
      actor,
    );
    expect(changed).toMatchObject({
      ok: true,
      value: { accommodationType: "ROOM", bedroomCount: null },
    });
  });

  it("refuses negative counts at the database too", async () => {
    await expect(
      client.room.update({
        where: { id: (await createRoom(client)).id },
        data: { bedroomCount: -1 },
      }),
    ).rejects.toThrow();
  });
});

describe("facility writes", () => {
  it("creates and updates facilities", async () => {
    const created = await facilities.create(
      TEST_BRANCH_ID,
      {
        name: "Spa",
        slug: "spa",
        shortDescription: "Treatments by appointment.",
        description: { type: "doc", content: [] },
        openingHoursText: "10:00–22:00",
        featured: false,
      },
      actor,
    );
    if (!created.ok) throw new Error(created.error.message);

    const updated = await facilities.update(
      created.value.id,
      {
        name: "Riverside Spa",
        slug: "riverside-spa",
        shortDescription: "Treatments by appointment.",
        description: { type: "doc", content: [] },
        openingHoursText: null,
        featured: true,
      },
      actor,
    );

    expect(updated).toMatchObject({
      ok: true,
      value: { slug: "riverside-spa", featured: true, openingHoursText: null },
    });
  });
});

describe("page section writes", () => {
  const hero = {
    id: null,
    type: "HERO" as const,
    heading: "Contact",
    eyebrow: null,
    payload: { schemaVersion: 1, title: "Contact", summary: "Get in touch." },
    isVisible: true,
  };
  const cta = {
    id: null,
    type: "CONTACT_CTA" as const,
    heading: null,
    eyebrow: null,
    payload: { schemaVersion: 1, body: "Write to us.", formEnabled: true },
    isVisible: true,
  };

  beforeEach(async () => {
    await client.page.create({
      data: {
        id: "contact",
        branchId: TEST_BRANCH_ID,
        key: "CONTACT",
        title: "Contact",
        canonicalPath: "/contact",
      },
    });
  });

  it("appends validated sections in order", async () => {
    await pages.saveSection(TEST_BRANCH_ID, "CONTACT", hero, actor);
    const result = await pages.saveSection(
      TEST_BRANCH_ID,
      "CONTACT",
      cta,
      actor,
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(
      result.value.sections.map(({ type, sortOrder }) => [type, sortOrder]),
    ).toEqual([
      ["HERO", 0],
      ["CONTACT_CTA", 1],
    ]);
  });

  it("rejects disallowed types and invalid payloads", async () => {
    expect(
      await pages.saveSection(
        TEST_BRANCH_ID,
        "CONTACT",
        {
          ...hero,
          type: "STATS",
          payload: { schemaVersion: 1, items: [{ value: "1", label: "x" }] },
        },
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await pages.saveSection(
        TEST_BRANCH_ID,
        "CONTACT",
        { ...hero, payload: {} },
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await pages.saveSection(
        TEST_BRANCH_ID,
        "CONTACT",
        { ...hero, heading: "x".repeat(161) },
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("never lets a required section be hidden", async () => {
    await pages.saveSection(TEST_BRANCH_ID, "CONTACT", hero, actor);
    const saved = await pages.saveSection(
      TEST_BRANCH_ID,
      "CONTACT",
      cta,
      actor,
    );
    expect((await pages.publish(TEST_BRANCH_ID, "CONTACT", actor)).ok).toBe(
      true,
    );
    if (!saved.ok) throw new Error(saved.error.message);
    const ctaId = saved.value.sections[1]!.id;

    expect(
      await pages.saveSection(
        TEST_BRANCH_ID,
        "CONTACT",
        { ...cta, id: ctaId, isVisible: false },
        actor,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { isVisible: [expect.any(String)] },
      },
    });
    expect(
      (await pages.findPublishedByKey(TEST_BRANCH_ID, "CONTACT"))?.sections.map(
        (s) => s.type,
      ),
    ).toEqual(["HERO", "CONTACT_CTA"]);
  });

  it("rejects section ids from another page", async () => {
    expect(
      await pages.saveSection(
        TEST_BRANCH_ID,
        "CONTACT",
        { ...hero, id: "unknown" },
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
