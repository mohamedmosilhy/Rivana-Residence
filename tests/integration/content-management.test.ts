import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import {
  CatalogCommands,
  FACILITY_KIND,
  ROOM_KIND,
} from "@/application/content/catalog-commands";
import {
  facilityInputFromForm,
  roomInputFromForm,
} from "@/application/content/catalog-forms";
import { PageCommands } from "@/application/content/page-commands";
import { PromotionAdmin } from "@/application/promotions/promotion-admin";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaPromotionRepository } from "@/infrastructure/db/prisma/repositories/promotion-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";

import { seedDatabase } from "../../prisma/seed-data";
import {
  actor,
  createActor,
  createMedia,
  createTestClient,
  resetDatabase,
} from "./support/database";

const client = createTestClient();
const admin: StaffPrincipal = {
  ...actor,
  name: "Test Administrator",
  email: "admin@example.test",
  sessionId: "s",
};
const editor: StaffPrincipal = { ...admin, role: "EDITOR" };
const cache = { invalidate: vi.fn(async () => undefined) };
const now = new Date("2026-09-25T12:00:00Z");

const rooms = new CatalogCommands(
  new PrismaRoomRepository(client),
  cache,
  ROOM_KIND,
);
const facilities = new CatalogCommands(
  new PrismaFacilityRepository(client),
  cache,
  FACILITY_KIND,
);
const pageRepository = new PrismaPageRepository(client);
const pages = new PageCommands(pageRepository, cache);
const promotions = new PromotionAdmin(
  new PrismaPromotionRepository(client),
  cache,
  {
    now: () => now,
  },
);

const roomForm = {
  name: "Nile Suite",
  slug: "nile-suite",
  shortDescription: "Wide windows over the Nile.",
  description: "Morning light.\n\n- Balcony\n- Rain shower",
  sizeSqm: "48",
  maxAdults: "2",
  maxChildren: "1",
  features: JSON.stringify([{ label: "Balcony" }, { label: "Rain shower" }]),
  featured: "on",
  seoTitle: "Nile Suite at Rivana",
};

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  cache.invalidate.mockClear();
});

async function createRoom(form = roomForm) {
  const result = await rooms.create(editor, roomInputFromForm(form));
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("room lifecycle", () => {
  it("creates a private draft with ordered features and search details", async () => {
    const room = await createRoom();

    expect(room).toMatchObject({
      status: "DRAFT",
      featured: true,
      sizeSqm: 48,
      seoTitle: "Nile Suite at Rivana",
      seoDescription: null,
      features: [{ label: "Balcony" }, { label: "Rain shower" }],
    });
    expect(room.description.content.map((node) => node.type)).toEqual([
      "paragraph",
      "bulletList",
    ]);
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it("replaces features in their new order on update", async () => {
    const room = await createRoom();
    const result = await rooms.update(
      editor,
      room.id,
      roomInputFromForm({
        ...roomForm,
        features: JSON.stringify([{ label: "Rain shower" }, { label: "Desk" }]),
      }),
    );

    expect(result.ok && result.value.features).toEqual([
      { label: "Rain shower" },
      { label: "Desk" },
    ]);
    expect(await client.roomFeature.count()).toBe(2);
  });

  it("returns field errors for invalid form input and writes nothing", async () => {
    const result = await rooms.create(
      editor,
      roomInputFromForm({
        ...roomForm,
        name: "",
        slug: "Nile Suite",
        maxAdults: "0",
        features: JSON.stringify([{ label: "" }]),
      }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(!result.ok && Object.keys(result.error.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["name", "slug", "maxAdults", "features.0.label"]),
    );
    expect(await client.room.count()).toBe(0);
  });

  it("explains a duplicate web address instead of failing", async () => {
    await createRoom();
    const result = await rooms.create(editor, roomInputFromForm(roomForm));
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", fieldErrors: { slug: [expect.any(String)] } },
    });
  });

  it("publishes once a ready hero is chosen, then unpublishes, archives, restores, and deletes", async () => {
    const room = await createRoom();
    const hero = await createMedia(client);
    const gallery = await createMedia(client);

    expect(await rooms.publish(editor, room.id)).toMatchObject({
      ok: false,
      error: { code: "NOT_PUBLISHABLE" },
    });

    expect(
      (
        await rooms.replaceMedia(editor, room.id, [
          { mediaId: hero.id, role: "HERO", sortOrder: 0, altOverride: null },
          {
            mediaId: gallery.id,
            role: "GALLERY",
            sortOrder: 0,
            altOverride: null,
          },
        ])
      ).ok,
    ).toBe(true);
    expect(await rooms.publish(editor, room.id)).toMatchObject({
      ok: true,
      value: { status: "PUBLISHED" },
    });
    expect(cache.invalidate).toHaveBeenLastCalledWith([
      "rooms",
      "room:nile-suite",
      "sitemap",
    ]);

    expect(await rooms.unpublish(editor, room.id)).toMatchObject({
      ok: true,
      value: { status: "DRAFT" },
    });
    expect(await rooms.unpublish(editor, room.id)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });

    // Deleting needs an archived record and an administrator.
    expect(await rooms.delete(admin, room.id)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect((await rooms.archive(editor, room.id)).ok).toBe(true);
    expect(await rooms.publish(editor, room.id)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await rooms.delete(editor, room.id)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await rooms.restore(editor, room.id)).toMatchObject({
      ok: true,
      value: { status: "DRAFT" },
    });
    expect((await rooms.archive(editor, room.id)).ok).toBe(true);
    expect((await rooms.delete(admin, room.id)).ok).toBe(true);

    expect(await client.room.count()).toBe(0);
    // Images stay in the library.
    expect(await client.mediaAsset.count()).toBe(2);
  });

  it("restores an archived room to the end of the active order", async () => {
    const first = await createRoom();
    const second = await createRoom({ ...roomForm, slug: "garden-studio" });
    await rooms.archive(editor, first.id);
    const third = await createRoom({ ...roomForm, slug: "family-residence" });

    const restored = await rooms.restore(editor, first.id);

    expect(restored.ok && restored.value.sortOrder).toBeGreaterThan(
      third.sortOrder,
    );
    expect(second.sortOrder).toBeLessThan(third.sortOrder);
  });

  it("moves a room within the active order", async () => {
    const a = await createRoom();
    const b = await createRoom({ ...roomForm, slug: "b-room" });
    const c = await createRoom({ ...roomForm, slug: "c-room" });

    expect((await rooms.move(editor, c.id, -1)).ok).toBe(true);

    const order = await client.room.findMany({ orderBy: { sortOrder: "asc" } });
    expect(order.map((room) => room.id)).toEqual([a.id, c.id, b.id]);
    expect(cache.invalidate).toHaveBeenLastCalledWith(["rooms", "sitemap"]);
  });

  it("keeps a published room publishable when edited", async () => {
    const room = await createRoom();
    const hero = await createMedia(client);
    await rooms.replaceMedia(editor, room.id, [
      { mediaId: hero.id, role: "HERO", sortOrder: 0, altOverride: null },
    ]);
    await rooms.publish(editor, room.id);

    expect(await rooms.replaceMedia(editor, room.id, [])).toMatchObject({
      ok: false,
      error: { code: "NOT_PUBLISHABLE" },
    });
    expect(await client.roomMedia.count()).toBe(1);
  });
});

describe("facility lifecycle", () => {
  it("creates, renames, and archives a facility", async () => {
    const created = await facilities.create(
      editor,
      facilityInputFromForm({
        name: "Pool Terrace",
        slug: "pool-terrace",
        shortDescription: "An outdoor pool.",
        description: "Open to all guests.",
        openingHoursText: "Daily 7:00–22:00",
      }),
    );
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value).toMatchObject({
      status: "DRAFT",
      openingHoursText: "Daily 7:00–22:00",
    });

    const renamed = await facilities.update(
      editor,
      created.value.id,
      facilityInputFromForm({
        name: "Pool",
        slug: "pool",
        shortDescription: "An outdoor pool.",
        description: "",
        openingHoursText: "",
      }),
    );
    expect(renamed).toMatchObject({
      ok: true,
      value: { slug: "pool", openingHoursText: null },
    });
    // Draft edits never touch public caches.
    expect(cache.invalidate).not.toHaveBeenCalled();
    expect((await facilities.archive(editor, created.value.id)).ok).toBe(true);
  });
});

describe("page management", () => {
  beforeEach(() => seedDatabase(client));

  it("seeds each page with its approved sections, idempotently", async () => {
    const home = await pageRepository.findAdminByKey("HOME");
    expect(home?.sections.map((section) => section.type)).toEqual([
      "HERO",
      "RICH_TEXT",
      "ROOM_GRID",
      "FACILITY_GRID",
      "IMAGE_TEXT_SPLIT",
      "CONTACT_CTA",
    ]);

    await pages.saveSection(editor, "HOME", home!.sections[0]!.id, {
      payload: JSON.stringify({ title: "Edited", summary: "Kept." }),
      isVisible: "on",
    });
    await seedDatabase(client);

    const reseeded = await pageRepository.findAdminByKey("HOME");
    expect(reseeded?.sections).toHaveLength(6);
    expect(reseeded?.sections[0]?.payload).toMatchObject({ title: "Edited" });
  });

  it("edits, reorders, publishes, and unpublishes the Home page", async () => {
    const view = await pages.get(editor, "HOME");
    if (!view.ok || !view.value) throw new Error("Home missing");
    const [, intro, , , lifestyle] = view.value.page.sections;

    expect(
      await pages.saveSection(editor, "HOME", lifestyle!.id, {
        heading: "Evenings",
        payload: JSON.stringify({
          bodyText: "Sunset on the terrace.",
          imageSide: "LEFT",
        }),
        isVisible: "on",
      }),
    ).toMatchObject({ ok: true });
    expect(
      (await pages.moveSection(editor, "HOME", lifestyle!.id, -1)).ok,
    ).toBe(true);
    expect(cache.invalidate).not.toHaveBeenCalled();

    expect(await pages.publish(editor, "HOME")).toMatchObject({
      ok: true,
      value: { isPublished: true },
    });
    expect(cache.invalidate).toHaveBeenLastCalledWith(["page:home", "sitemap"]);

    // While public, hiding the only visible intro would break the page.
    await pages.saveSection(editor, "HOME", lifestyle!.id, {
      payload: JSON.stringify({ bodyText: "Sunset.", imageSide: "LEFT" }),
    });
    expect(
      await pages.saveSection(editor, "HOME", intro!.id, {
        payload: JSON.stringify({ documentText: "Welcome." }),
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_PUBLISHABLE" } });
    expect(cache.invalidate).toHaveBeenCalledWith(["page:home", "sitemap"]);

    expect(await pages.unpublish(editor, "HOME")).toMatchObject({
      ok: true,
      value: { isPublished: false },
    });
    expect(await pageRepository.findPublishedByKey("HOME")).toBeNull();
  });

  it("never hides a required section or moves the Hero", async () => {
    const view = await pages.get(editor, "ABOUT");
    if (!view.ok || !view.value) throw new Error("About missing");
    const [hero, story, stats] = view.value.page.sections;

    expect(
      await pages.saveSection(editor, "ABOUT", story!.id, {
        payload: JSON.stringify({ bodyText: "Story.", imageSide: "LEFT" }),
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await pages.moveSection(editor, "ABOUT", story!.id, -1),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect((await pages.moveSection(editor, "ABOUT", stats!.id, -1)).ok).toBe(
      true,
    );
    const reordered = await pageRepository.findAdminByKey("ABOUT");
    expect(reordered?.sections[0]?.id).toBe(hero!.id);
    expect(reordered?.sections[1]?.id).toBe(stats!.id);
  });

  it("rejects invalid section input with field paths", async () => {
    const view = await pages.get(editor, "ABOUT");
    const stats = view.ok ? view.value?.page.sections[2] : undefined;
    const result = await pages.saveSection(editor, "ABOUT", stats!.id, {
      payload: JSON.stringify({ items: [{ value: "", label: "Rooms" }] }),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(!result.ok && Object.keys(result.error.fieldErrors ?? {})).toContain(
      "items.0.value",
    );
  });

  it("saves search details", async () => {
    expect(
      await pages.updateDetails(editor, "CONTACT", {
        seoTitle: "Contact Rivana",
        seoDescription: "",
      }),
    ).toMatchObject({
      ok: true,
      value: { seoTitle: "Contact Rivana", seoDescription: null },
    });
  });
});

describe("promotion lifecycle", () => {
  const input = {
    internalName: "Autumn",
    headline: "Autumn by the river",
    body: "Stay longer.",
    code: "AUTUMN26",
    terms: null,
    startsAt: null,
    endsAt: null,
    priority: 1,
    showAsPopup: true,
  };

  it("publishes, explains, unpublishes, archives, restores, and deletes", async () => {
    const created = await promotions.create(editor, input);
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.id;
    expect(cache.invalidate).toHaveBeenCalledWith(["promotion:active"]);

    await promotions.publish(editor, id);
    const shown = await promotions.get(editor, id);
    expect(shown.ok && shown.value?.display).toEqual({ state: "showing" });

    const rival = await promotions.create(editor, {
      ...input,
      internalName: "Winter",
      priority: 9,
    });
    if (!rival.ok) throw new Error(rival.error.message);
    await promotions.publish(editor, rival.value.id);
    const outranked = await promotions.get(editor, id);
    expect(outranked.ok && outranked.value?.display).toMatchObject({
      state: "outranked",
      winner: { id: rival.value.id },
    });

    expect(await promotions.unpublish(editor, id)).toMatchObject({
      ok: true,
      value: { status: "DRAFT" },
    });
    expect((await promotions.archive(editor, id)).ok).toBe(true);
    expect(await promotions.delete(editor, id)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await promotions.restore(editor, id)).toMatchObject({
      ok: true,
      value: { status: "DRAFT" },
    });
    expect(await promotions.delete(admin, id)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    await promotions.archive(editor, id);
    expect((await promotions.delete(admin, id)).ok).toBe(true);
    expect(await client.promotion.count()).toBe(1);
  });
});

describe("media options", () => {
  it("lists only ready images", async () => {
    const ready = await createMedia(client);
    await createMedia(client, { status: "PENDING" });
    await createMedia(client, { status: "FAILED" });

    expect(
      (await new PrismaMediaRepository(client).listReady()).map(
        (media) => media.id,
      ),
    ).toEqual([ready.id]);
  });
});

describe("timestamp storage", () => {
  it("stores Prisma-written instants as true UTC regardless of the server zone", async () => {
    const startsAt = new Date("2030-01-10T07:00:00.000Z");
    const created = await promotions.create(editor, {
      internalName: "Timing",
      headline: "Headline",
      body: "Body",
      code: "TIMING",
      terms: null,
      startsAt,
      endsAt: null,
      priority: 0,
      showAsPopup: true,
    });
    if (!created.ok) throw new Error(created.error.message);

    // Read through a separate connection in the database's default zone.
    const [row] = await client.$queryRaw<{ epoch: number }[]>`
      SELECT extract(epoch FROM "startsAt")::float8 AS epoch
      FROM "Promotion" WHERE id = ${created.value.id}`;
    expect(row?.epoch).toBe(startsAt.getTime() / 1000);
    expect(created.value.startsAt).toEqual(startsAt);
  });
});
