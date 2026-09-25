import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type {
  PromotionInput,
  RoomInput,
} from "@/application/ports/repositories";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaPromotionRepository } from "@/infrastructure/db/prisma/repositories/promotion-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";

import {
  actor,
  createActor,
  createMedia,
  createRoom,
  createTestClient,
  resetDatabase,
} from "./support/database";

const client = createTestClient();
const rooms = new PrismaRoomRepository(client);
const facilities = new PrismaFacilityRepository(client);
const pages = new PrismaPageRepository(client);
const promotions = new PrismaPromotionRepository(client);

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

    const result = await rooms.create(roomInput, actor);

    expect(result).toMatchObject({
      ok: true,
      value: { status: "DRAFT", sortOrder: 5, sizeSqm: 48.5, featured: true },
    });
    expect(await rooms.listPublished()).toEqual([]);
    expect(await rooms.listAdmin()).toHaveLength(3);
  });

  it("returns field errors for invalid input", async () => {
    const result = await rooms.create(
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
    await rooms.create(roomInput, actor);
    expect(await rooms.create(roomInput, actor)).toMatchObject({
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

describe("facility writes", () => {
  it("creates and updates facilities", async () => {
    const created = await facilities.create(
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
        key: "CONTACT",
        title: "Contact",
        canonicalPath: "/contact",
      },
    });
  });

  it("appends validated sections in order", async () => {
    await pages.saveSection("CONTACT", hero, actor);
    const result = await pages.saveSection("CONTACT", cta, actor);

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
      await pages.saveSection("CONTACT", { ...hero, payload: {} }, actor),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await pages.saveSection(
        "CONTACT",
        { ...hero, heading: "x".repeat(161) },
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("refuses edits that would break a published page", async () => {
    await pages.saveSection("CONTACT", hero, actor);
    const saved = await pages.saveSection("CONTACT", cta, actor);
    expect((await pages.publish("CONTACT", actor)).ok).toBe(true);
    if (!saved.ok) throw new Error(saved.error.message);
    const ctaId = saved.value.sections[1]!.id;

    expect(
      await pages.saveSection(
        "CONTACT",
        { ...cta, id: ctaId, isVisible: false },
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_PUBLISHABLE" } });
    expect(
      (await pages.findPublishedByKey("CONTACT"))?.sections.map((s) => s.type),
    ).toEqual(["HERO", "CONTACT_CTA"]);
  });

  it("rejects section ids from another page", async () => {
    expect(
      await pages.saveSection("CONTACT", { ...hero, id: "unknown" }, actor),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("promotion writes", () => {
  const input: PromotionInput = {
    internalName: "Autumn 2026",
    headline: "Autumn by the river",
    body: "Stay three nights, pay for two.",
    code: "AUTUMN26",
    terms: null,
    startsAt: new Date("2026-10-01T00:00:00Z"),
    endsAt: new Date("2026-11-01T00:00:00Z"),
    priority: 10,
    showAsPopup: true,
  };

  it("creates drafts and bumps version only for public content changes", async () => {
    const created = await promotions.create(input, actor);
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value).toMatchObject({ status: "DRAFT", version: 1 });

    const renamed = await promotions.update(
      created.value.id,
      { ...input, internalName: "Autumn campaign" },
      actor,
    );
    expect(renamed).toMatchObject({ ok: true, value: { version: 1 } });

    const recoded = await promotions.update(
      created.value.id,
      { ...input, code: "FALL26" },
      actor,
    );
    expect(recoded).toMatchObject({ ok: true, value: { version: 2 } });
  });

  it("rejects an invalid schedule", async () => {
    expect(
      await promotions.create({ ...input, endsAt: input.startsAt }, actor),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: {
          endsAt: ["Promotion end time must be after its start time."],
        },
      },
    });
  });

  it("returns only public fields", async () => {
    const created = await promotions.create(input, actor);
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value).not.toHaveProperty("createdById");
    expect(created.value).not.toHaveProperty("updatedById");
  });
});
