import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";

import {
  createActor,
  createMedia,
  createRoom,
  createTestClient,
  resetDatabase,
} from "./support/database";

const client = createTestClient();

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
});

describe("database constraints", () => {
  it("rejects duplicate room slugs", async () => {
    await createRoom(client, { slug: "river-suite" });
    await expect(createRoom(client, { slug: "river-suite" })).rejects.toThrow();
  });

  it("rejects malformed slugs", async () => {
    await expect(createRoom(client, { slug: "River Suite" })).rejects.toThrow();
  });

  it("rejects duplicate active room order but allows archived collisions", async () => {
    await createRoom(client, { sortOrder: 1 });
    await expect(createRoom(client, { sortOrder: 1 })).rejects.toThrow();
    await expect(
      createRoom(client, { sortOrder: 1, status: "ARCHIVED" }),
    ).resolves.toBeDefined();
  });

  it("rejects duplicate page section order", async () => {
    const page = await client.page.create({
      data: { id: "home", key: "HOME", title: "Home", canonicalPath: "/" },
    });
    const section = {
      pageId: page.id,
      type: "RICH_TEXT" as const,
      payload: {},
      sortOrder: 0,
    };
    await client.pageSection.create({ data: { id: "s1", ...section } });
    await expect(
      client.pageSection.create({ data: { id: "s2", ...section } }),
    ).rejects.toThrow();
  });

  it.each([
    ["zero adults", { maxAdults: 0 }],
    ["negative children", { maxChildren: -1 }],
    ["non-positive size", { sizeSqm: 0 }],
  ])("rejects invalid occupancy or size: %s", async (_label, data) => {
    const room = await createRoom(client);
    await expect(
      client.room.update({ where: { id: room.id }, data }),
    ).rejects.toThrow();
  });

  it("rejects a promotion that ends before it starts", async () => {
    await expect(
      client.promotion.create({
        data: {
          id: "promo",
          internalName: "Spring",
          headline: "Spring",
          body: "Spring stay",
          code: "SPRING",
          startsAt: new Date("2026-10-02T00:00:00Z"),
          endsAt: new Date("2026-10-01T00:00:00Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects ready media without dimensions and path traversal keys", async () => {
    const media = await createMedia(client, { status: "PENDING" });
    await expect(
      client.mediaAsset.update({
        where: { id: media.id },
        data: { status: "READY" },
      }),
    ).rejects.toThrow();
    await expect(
      client.mediaAsset.update({
        where: { id: media.id },
        data: { storageKey: "../secrets.webp" },
      }),
    ).rejects.toThrow();
  });

  it("protects referenced media from deletion at database and repository level", async () => {
    const media = await createMedia(client);
    await createRoom(client, { heroMediaId: media.id });
    const repository = new PrismaMediaRepository(client);

    await expect(
      client.mediaAsset.delete({ where: { id: media.id } }),
    ).rejects.toThrow();
    expect(await repository.countUsage(media.id)).toBe(1);
    expect(await repository.deleteIfUnreferenced(media.id)).toMatchObject({
      ok: false,
      error: { code: "REFERENCED" },
    });
    expect(
      (await client.mediaAsset.findUniqueOrThrow({ where: { id: media.id } }))
        .status,
    ).toBe("READY");
  });

  it("soft-deletes unreferenced media", async () => {
    const media = await createMedia(client);
    const repository = new PrismaMediaRepository(client);

    expect(await repository.deleteIfUnreferenced(media.id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await repository.findAdminById(media.id))?.status).toBe("DELETED");
  });

  it("finalizes pending media only once dimensions are known", async () => {
    const media = await createMedia(client, { status: "PENDING" });
    const repository = new PrismaMediaRepository(client);

    expect(await repository.finalize(media.id)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });

    await client.mediaAsset.update({
      where: { id: media.id },
      data: { width: 1200, height: 800 },
    });
    expect(await repository.finalize(media.id)).toMatchObject({
      ok: true,
      value: { status: "READY", width: 1200 },
    });
    expect(await repository.finalize(media.id)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
