import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";
import { PrismaSettingsRepository } from "@/infrastructure/db/prisma/repositories/settings-repository";

import {
  actor,
  createActor,
  createFacility,
  createMedia,
  createRoom,
  createTestClient,
  resetDatabase,
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

describe("room repository", () => {
  it("returns only published rooms publicly, in order", async () => {
    const hero = await createMedia(client);
    const second = await createRoom(client, {
      status: "PUBLISHED",
      sortOrder: 2,
      heroMediaId: hero.id,
    });
    const first = await createRoom(client, {
      status: "PUBLISHED",
      sortOrder: 1,
      heroMediaId: hero.id,
    });
    const draft = await createRoom(client, { status: "DRAFT" });
    const archived = await createRoom(client, { status: "ARCHIVED" });

    expect((await rooms.listPublished()).map((room) => room.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(await rooms.findPublishedBySlug(draft.slug)).toBeNull();
    expect(await rooms.findPublishedBySlug(archived.slug)).toBeNull();
    expect((await rooms.findAdminById(draft.id))?.status).toBe("DRAFT");
  });

  it("maps a public room without infrastructure fields", async () => {
    const hero = await createMedia(client);
    const room = await createRoom(client, {
      status: "PUBLISHED",
      heroMediaId: hero.id,
    });

    const result = await rooms.findPublishedBySlug(room.slug);

    expect(result).toEqual({
      id: room.id,
      name: room.name,
      slug: room.slug,
      shortDescription: "A calm room above the river.",
      description: { type: "doc", content: [] },
      sizeSqm: null,
      maxAdults: 2,
      maxChildren: 0,
      bedSummary: null,
      viewSummary: null,
      featured: false,
      sortOrder: room.sortOrder,
      status: "PUBLISHED",
      media: [
        {
          id: hero.id,
          role: "HERO",
          sortOrder: 0,
          status: "READY",
          altText: "Bedroom with river view",
          altOverride: null,
        },
      ],
    });
  });

  it("refuses to publish a room without a ready hero image", async () => {
    const room = await createRoom(client);

    const result = await rooms.publish(room.id, actor);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "NOT_PUBLISHABLE",
        fieldErrors: {
          media: ["A published room requires exactly one ready hero image."],
        },
      },
    });
    expect((await rooms.findAdminById(room.id))?.status).toBe("DRAFT");
  });

  it("publishes a ready room and records the actor", async () => {
    const hero = await createMedia(client);
    const room = await createRoom(client, { heroMediaId: hero.id });

    const result = await rooms.publish(room.id, actor);

    expect(result).toMatchObject({ ok: true, value: { status: "PUBLISHED" } });
    expect(
      (await client.room.findUniqueOrThrow({ where: { id: room.id } }))
        .updatedById,
    ).toBe(actor.id);
  });

  it("reports a missing room", async () => {
    expect(await rooms.publish("missing", actor)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("reorders every active room atomically", async () => {
    const a = await createRoom(client, { sortOrder: 0 });
    const b = await createRoom(client, { sortOrder: 1 });
    const c = await createRoom(client, { sortOrder: 2 });
    await createRoom(client, { status: "ARCHIVED", sortOrder: 0 });

    expect(await rooms.reorder([c.id, a.id, b.id], actor)).toEqual({
      ok: true,
      value: undefined,
    });

    const ordered = await client.room.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { sortOrder: "asc" },
    });
    expect(ordered.map((room) => [room.id, room.sortOrder])).toEqual([
      [c.id, 0],
      [a.id, 1],
      [b.id, 2],
    ]);
  });

  it.each([
    ["an incomplete list", (ids: string[]) => ids.slice(1)],
    ["a duplicated id", (ids: string[]) => [ids[0]!, ids[0]!, ids[1]!]],
    ["an unknown id", (ids: string[]) => [...ids.slice(1), "unknown"]],
  ])("rejects reorder with %s and leaves order unchanged", async (_, pick) => {
    const a = await createRoom(client, { sortOrder: 0 });
    const b = await createRoom(client, { sortOrder: 1 });
    const c = await createRoom(client, { sortOrder: 2 });

    const result = await rooms.reorder(pick([a.id, b.id, c.id]), actor);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const ordered = await client.room.findMany({
      orderBy: { sortOrder: "asc" },
    });
    expect(ordered.map((room) => room.id)).toEqual([a.id, b.id, c.id]);
  });

  it("swaps media on a published room atomically", async () => {
    const oldHero = await createMedia(client);
    const newHero = await createMedia(client);
    const gallery = await createMedia(client);
    const room = await createRoom(client, {
      status: "PUBLISHED",
      heroMediaId: oldHero.id,
    });

    const result = await rooms.replaceMedia(
      room.id,
      [
        { mediaId: newHero.id, role: "HERO", sortOrder: 0, altOverride: null },
        {
          mediaId: gallery.id,
          role: "GALLERY",
          sortOrder: 0,
          altOverride: "Terrace at dusk",
        },
      ],
      actor,
    );

    expect(result.ok).toBe(true);
    const media = (await rooms.findAdminById(room.id))?.media ?? [];
    expect(media.map(({ id, role }) => [id, role])).toEqual([
      [newHero.id, "HERO"],
      [gallery.id, "GALLERY"],
    ]);
  });

  it("rejects a media swap that would make a published room invalid", async () => {
    const hero = await createMedia(client);
    const pending = await createMedia(client, { status: "PENDING" });
    const room = await createRoom(client, {
      status: "PUBLISHED",
      heroMediaId: hero.id,
    });

    const result = await rooms.replaceMedia(
      room.id,
      [{ mediaId: pending.id, role: "HERO", sortOrder: 0, altOverride: null }],
      actor,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "NOT_PUBLISHABLE" },
    });
    expect(
      (await rooms.findAdminById(room.id))?.media.map((item) => item.id),
    ).toEqual([hero.id]);
  });

  it("rejects deleted media and duplicate slots in a swap", async () => {
    const deleted = await createMedia(client, { status: "DELETED" });
    const ready = await createMedia(client);
    const room = await createRoom(client);

    expect(
      await rooms.replaceMedia(
        room.id,
        [
          {
            mediaId: deleted.id,
            role: "HERO",
            sortOrder: 0,
            altOverride: null,
          },
        ],
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await rooms.replaceMedia(
        room.id,
        [
          {
            mediaId: ready.id,
            role: "GALLERY",
            sortOrder: 0,
            altOverride: null,
          },
          {
            mediaId: ready.id,
            role: "GALLERY",
            sortOrder: 0,
            altOverride: null,
          },
        ],
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("archives a room so it leaves public queries", async () => {
    const hero = await createMedia(client);
    const room = await createRoom(client, {
      status: "PUBLISHED",
      heroMediaId: hero.id,
    });

    expect((await rooms.archive(room.id, actor)).ok).toBe(true);
    expect(await rooms.listPublished()).toEqual([]);
  });
});

describe("facility repository", () => {
  it("returns only published facilities publicly", async () => {
    const hero = await createMedia(client);
    const published = await createFacility(client, {
      status: "PUBLISHED",
      heroMediaId: hero.id,
    });
    await createFacility(client, { status: "DRAFT" });
    const archived = await createFacility(client, { status: "ARCHIVED" });

    expect((await facilities.listPublished()).map((item) => item.id)).toEqual([
      published.id,
    ]);
    expect(await facilities.findPublishedBySlug(archived.slug)).toBeNull();
  });

  it("publishes only facilities with a ready hero", async () => {
    const draft = await createFacility(client);
    expect(await facilities.publish(draft.id, actor)).toMatchObject({
      ok: false,
      error: { code: "NOT_PUBLISHABLE" },
    });

    const hero = await createMedia(client);
    expect(
      (
        await facilities.replaceMedia(
          draft.id,
          [{ mediaId: hero.id, role: "HERO", sortOrder: 0, altOverride: null }],
          actor,
        )
      ).ok,
    ).toBe(true);
    expect(await facilities.publish(draft.id, actor)).toMatchObject({
      ok: true,
      value: { status: "PUBLISHED" },
    });
  });

  it("reorders facilities", async () => {
    const a = await createFacility(client, { sortOrder: 0 });
    const b = await createFacility(client, { sortOrder: 1 });

    expect((await facilities.reorder([b.id, a.id], actor)).ok).toBe(true);
    const ordered = await client.facility.findMany({
      orderBy: { sortOrder: "asc" },
    });
    expect(ordered.map((item) => item.id)).toEqual([b.id, a.id]);
  });
});

describe("page repository", () => {
  async function createContactPage(
    sections: {
      type: "HERO" | "CONTACT_CTA" | "RICH_TEXT";
      payload: object;
      isVisible?: boolean;
    }[],
  ) {
    return client.page.create({
      data: {
        id: "contact",
        key: "CONTACT",
        title: "Contact",
        canonicalPath: "/contact",
        sections: {
          create: sections.map((section, index) => ({
            id: `section-${index}`,
            type: section.type,
            payload: section.payload,
            isVisible: section.isVisible ?? true,
            sortOrder: index,
          })),
        },
      },
    });
  }

  const hero = {
    type: "HERO" as const,
    payload: { schemaVersion: 1, title: "Contact", summary: "Get in touch." },
  };
  const cta = {
    type: "CONTACT_CTA" as const,
    payload: { schemaVersion: 1, body: "Write to us.", formEnabled: true },
  };

  it("hides unpublished pages and hidden sections publicly", async () => {
    await createContactPage([
      hero,
      { ...cta },
      { type: "RICH_TEXT", payload: {}, isVisible: false },
    ]);

    expect(await pages.findPublishedByKey("CONTACT")).toBeNull();
    expect((await pages.publish("CONTACT", actor)).ok).toBe(true);

    const page = await pages.findPublishedByKey("CONTACT");
    expect(page?.sections.map((section) => section.type)).toEqual([
      "HERO",
      "CONTACT_CTA",
    ]);
    expect((await pages.findAdminByKey("CONTACT"))?.sections).toHaveLength(3);
  });

  it("refuses to publish a page missing required sections", async () => {
    await createContactPage([hero]);

    expect(await pages.publish("CONTACT", actor)).toMatchObject({
      ok: false,
      error: {
        code: "NOT_PUBLISHABLE",
        fieldErrors: {
          sections: ["A visible CONTACT_CTA section is required."],
        },
      },
    });
    expect((await pages.findAdminByKey("CONTACT"))?.isPublished).toBe(false);
  });

  it("reorders every section atomically", async () => {
    const page = await createContactPage([hero, cta]);

    expect(
      (await pages.reorderSections(page.id, ["section-1", "section-0"], actor))
        .ok,
    ).toBe(true);
    expect(
      (await pages.findAdminByKey("CONTACT"))?.sections.map((s) => s.id),
    ).toEqual(["section-1", "section-0"]);

    expect(
      await pages.reorderSections(page.id, ["section-1"], actor),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
});

describe("settings repository", () => {
  it("returns the singleton settings", async () => {
    await client.siteSettings.create({
      data: { id: "default", siteName: "Rivana Residence" },
    });

    expect(await new PrismaSettingsRepository(client).getPublic()).toEqual({
      id: "default",
      siteName: "Rivana Residence",
      timeZone: "Africa/Cairo",
      tagline: null,
      phone: null,
      email: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      country: null,
      latitude: null,
      longitude: null,
      mapEmbedUrl: null,
      footerText: null,
      defaultSeoTitle: null,
      defaultSeoDescription: null,
      socialLinks: [],
    });
  });
});
