import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import { CleanupMedia } from "@/application/media/cleanup-media";
import { importReferenceAssets } from "@/application/media/import-reference-assets";
import type { IngestDependencies } from "@/application/media/ingest-image";
import { MediaLibrary } from "@/application/media/media-library";
import type { MediaStorage } from "@/application/ports/providers";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import { LocalMediaStorage } from "@/infrastructure/media/local-media-storage";
import { NodeHasher } from "@/infrastructure/media/node-hasher";
import { SharpImageProcessor } from "@/infrastructure/media/sharp-image-processor";

import {
  actor,
  createActor,
  createRoom,
  createTestClient,
  resetDatabase,
} from "./support/database";
import {
  animatedWebp,
  image,
  jpegWithExif,
  pngClaiming,
  stream,
} from "./support/images";

const client = createTestClient();
const media = new PrismaMediaRepository(client);
const cache = { invalidate: vi.fn(async () => undefined) };
const editor: StaffPrincipal = {
  ...actor,
  role: "EDITOR",
  name: "Test Administrator",
  email: "admin@example.test",
  sessionId: "s",
};
const admin: StaffPrincipal = { ...editor, role: "ADMIN" };
let root: string;
let storage: LocalMediaStorage;
let deps: IngestDependencies;
let library: MediaLibrary;

const types = {
  jpeg: ["image/jpeg", "jpg"],
  png: ["image/png", "png"],
  webp: ["image/webp", "webp"],
  avif: ["image/avif", "avif"],
} as const;

function upload(
  bytes: Uint8Array,
  filename: string,
  declaredType: string,
  overrides: Partial<{
    rightsConfirmed: boolean;
    staff: StaffPrincipal | null;
  }> = {},
) {
  return library.upload(
    overrides.staff === undefined ? editor : overrides.staff,
    {
      filename,
      declaredType,
      declaredBytes: bytes.byteLength,
      source: stream(bytes),
      rightsConfirmed: overrides.rightsConfirmed ?? true,
    },
  );
}

async function readyImage(color = "#3f1930") {
  const result = await upload(
    await image("webp", { color }),
    "photo.webp",
    "image/webp",
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function objectFiles() {
  const found: string[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else found.push(path.relative(root, full));
    }
  }
  await walk(root);
  return found.filter((file) => !file.startsWith("quarantine"));
}

afterAll(async () => {
  await client.$disconnect();
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  if (root) await rm(root, { recursive: true, force: true });
  root = await mkdtemp(path.join(os.tmpdir(), "rivana-media-it-"));
  storage = await LocalMediaStorage.create(root);
  deps = {
    media,
    storage,
    images: new SharpImageProcessor(),
    hasher: new NodeHasher(),
    ids: new Cuid2IdGenerator(),
    clock: { now: () => new Date("2026-09-25T12:00:00Z") },
  };
  library = new MediaLibrary(deps, cache);
  cache.invalidate.mockClear();
});

describe("upload verification", () => {
  it.each(Object.entries(types))(
    "accepts a valid %s image",
    async (format, [mime, extension]) => {
      const bytes = await image(format as keyof typeof types);
      const result = await upload(bytes, `pool.${extension}`, mime);

      expect(result).toMatchObject({
        ok: true,
        value: {
          status: "READY",
          width: 64,
          height: 48,
          mimeType: mime,
          rightsStatus: "CONFIRMED",
        },
      });
      if (!result.ok) return;
      expect(result.value.storageKey).toMatch(
        new RegExp(`^images/2026/09/[a-z0-9]+\\.${extension}$`),
      );
      const stored = await storage.open(result.value.storageKey);
      expect(stored?.size).toBe(result.value.bytes);
      expect(result.value.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(await media.findServable(result.value.storageKey)).toMatchObject({
        mimeType: mime,
      });
      expect(await storage.listQuarantine()).toEqual([]);
    },
  );

  it("strips camera metadata by re-encoding", async () => {
    const bytes = await jpegWithExif();
    expect((await sharp(bytes).metadata()).exif).toBeDefined();

    const result = await upload(bytes, "photo.jpg", "image/jpeg");

    if (!result.ok) throw new Error(result.error.message);
    const stored = await storage.open(result.value.storageKey);
    const storedBytes = new Uint8Array(
      await new Response(stored!.stream).arrayBuffer(),
    );
    expect((await sharp(storedBytes).metadata()).exif).toBeUndefined();
    expect(Buffer.from(storedBytes).includes("Secret Photographer")).toBe(
      false,
    );
  });

  it("drops data hidden after the image (polyglot files)", async () => {
    const payload = new TextEncoder().encode(
      "<script>alert(1)</script>PK\u0003\u0004",
    );
    const bytes = new Uint8Array([...(await image("jpeg")), ...payload]);

    const result = await upload(bytes, "photo.jpg", "image/jpeg");

    if (!result.ok) throw new Error(result.error.message);
    const stored = await storage.open(result.value.storageKey);
    const storedBytes = Buffer.from(
      await new Response(stored!.stream).arrayBuffer(),
    );
    expect(storedBytes.includes("<script>")).toBe(false);
  });

  it.each([
    [
      "a PNG named as a JPEG",
      async () => image("png"),
      "photo.jpg",
      "image/jpeg",
      "do not match",
    ],
    [
      "a GIF named as a PNG",
      async () => new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000"),
      "photo.png",
      "image/png",
      "not a readable image",
    ],
    [
      "an HTML file named as an image",
      async () => new TextEncoder().encode("<html><script>alert(1)</script>"),
      "photo.webp",
      "image/webp",
      "not a readable image",
    ],
    [
      "a truncated JPEG",
      async () =>
        (await image("jpeg", { width: 400, height: 300 })).subarray(0, 300),
      "photo.jpg",
      "image/jpeg",
      "not a readable image",
    ],
    ["an animated WebP", animatedWebp, "anim.webp", "image/webp", "Animated"],
    [
      "a decompression bomb",
      async () => pngClaiming(60_000, 60_000),
      "bomb.png",
      "image/png",
      "40 megapixels",
    ],
    [
      "an image over 40 megapixels",
      async () => pngClaiming(7_000, 7_000),
      "big.png",
      "image/png",
      "40 megapixels",
    ],
    [
      "an empty file",
      async () => new Uint8Array(),
      "empty.png",
      "image/png",
      "empty",
    ],
  ] as const)(
    "rejects %s and keeps nothing public",
    async (_, make, filename, mime, message) => {
      const result = await upload(await make(), filename, mime);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
      expect(!result.ok && result.error.message).toContain(message);
      const rows = await client.mediaAsset.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "FAILED" });
      expect(rows[0]?.failureReason).toContain(message);
      expect(await objectFiles()).toEqual([]);
      expect(await storage.listQuarantine()).toEqual([]);
      expect(await media.findServable(rows[0]!.storageKey)).toBeNull();
    },
  );

  it.each([
    ["an SVG", "logo.svg", "image/svg+xml"],
    ["a mismatched extension", "photo.png.exe", "image/png"],
  ])("rejects %s before storing anything", async (_, filename, mime) => {
    const result = await upload(await image("png"), filename, mime);
    expect(result.ok).toBe(false);
    expect(await client.mediaAsset.count()).toBe(0);
  });

  it("stops reading an oversized upload at the size cap", async () => {
    const huge = new Uint8Array(15 * 1024 * 1024 + 1);
    huge.set([0xff, 0xd8, 0xff]);
    const result = await library.upload(editor, {
      filename: "huge.jpg",
      declaredType: "image/jpeg",
      declaredBytes: null,
      source: stream(huge),
      rightsConfirmed: true,
    });
    expect(!result.ok && result.error.message).toContain("15 MB");
    expect(await storage.listQuarantine()).toEqual([]);
  });

  it("refuses a duplicate and points to the existing image", async () => {
    const first = await readyImage();
    const again = await upload(await image("webp"), "copy.webp", "image/webp");

    expect(again).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", fieldErrors: { duplicateOf: [first.id] } },
    });
    expect(await client.mediaAsset.count()).toBe(1);
  });

  it("requires a signed-in uploader who confirms the rights", async () => {
    expect(
      await upload(await image("png"), "a.png", "image/png", { staff: null }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    expect(
      await upload(await image("png"), "a.png", "image/png", {
        rightsConfirmed: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await client.mediaAsset.count()).toBe(0);
  });

  it("cleans up when storing the object fails", async () => {
    const failing: MediaStorage = Object.assign(Object.create(storage), {
      put: vi.fn(async () => {
        throw new Error("disk full");
      }),
    });
    const brittle = new MediaLibrary({ ...deps, storage: failing }, cache);

    await expect(
      brittle.upload(editor, {
        filename: "a.png",
        declaredType: "image/png",
        declaredBytes: null,
        source: stream(await image("png")),
        rightsConfirmed: true,
      }),
    ).rejects.toThrow("disk full");

    expect(await client.mediaAsset.findFirst()).toMatchObject({
      status: "FAILED",
      failureReason: "The upload could not be stored. Try again.",
    });
    expect(await storage.listQuarantine()).toEqual([]);
    expect(await objectFiles()).toEqual([]);
  });

  it("finalizes idempotently", async () => {
    const asset = await readyImage();
    const again = await media.markReady(asset.id, {
      bytes: 1,
      width: 1,
      height: 1,
      checksum: "different",
    });
    expect(again).toMatchObject({
      ok: true,
      value: { bytes: asset.bytes, checksum: asset.checksum },
    });
  });
});

describe("references, replacement, and deletion", () => {
  async function useAsHero(
    mediaId: string,
    status: "DRAFT" | "PUBLISHED" = "DRAFT",
  ) {
    const room = await createRoom(client, { status, heroMediaId: mediaId });
    return room;
  }

  it("lists every place an image is used", async () => {
    const asset = await readyImage();
    const room = await useAsHero(asset.id, "PUBLISHED");
    await client.siteSettings.create({
      data: { id: "default", siteName: "Rivana", logoMediaId: asset.id },
    });

    const details = await library.details(editor, asset.id);

    expect(details.ok && details.value?.usage).toEqual([
      expect.objectContaining({
        kind: "ROOM",
        ownerId: room.id,
        role: "Hero image",
        isPublic: true,
      }),
      expect.objectContaining({
        kind: "SITE_SETTINGS",
        role: "Logo",
        isPublic: true,
      }),
    ]);
    const listed = await library.list(editor, { usage: "used" });
    expect(
      listed.ok && listed.value.items.map((item) => [item.id, item.usageCount]),
    ).toEqual([[asset.id, 2]]);
  });

  it("blocks deleting a referenced image and deletes an unused one", async () => {
    const used = await readyImage("#111111");
    const unused = await readyImage("#222222");
    await useAsHero(used.id);

    expect(await library.delete(admin, used.id)).toMatchObject({
      ok: false,
      error: { code: "REFERENCED" },
    });
    expect(await library.delete(editor, unused.id)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect((await library.delete(admin, unused.id)).ok).toBe(true);

    expect(
      await client.mediaAsset.findUnique({ where: { id: unused.id } }),
    ).toBeNull();
    expect(await storage.open(unused.storageKey)).toBeNull();
    expect(await storage.open(used.storageKey)).not.toBeNull();
  });

  it("stops serving immediately and retries object removal when storage fails", async () => {
    const asset = await readyImage();
    const flaky: MediaStorage = Object.assign(Object.create(storage), {
      delete: vi.fn(async () => {
        throw new Error("I/O error");
      }),
    });

    expect(
      (
        await new MediaLibrary({ ...deps, storage: flaky }, cache).delete(
          admin,
          asset.id,
        )
      ).ok,
    ).toBe(true);
    expect(
      await client.mediaAsset.findUnique({ where: { id: asset.id } }),
    ).toMatchObject({
      status: "DELETED",
    });
    expect(await media.findServable(asset.storageKey)).toBeNull();

    const report = await new CleanupMedia(deps, deps.clock).execute();
    expect(report.deletedObjects).toBe(1);
    expect(await client.mediaAsset.count()).toBe(0);
    expect(await objectFiles()).toEqual([]);
  });

  it("replaces an image everywhere at once and keeps the old one", async () => {
    const old = await readyImage("#111111");
    await media.updateDetails(old.id, {
      altText: "Nile Suite bedroom",
      caption: "Evening",
      credit: null,
      focalX: null,
      focalY: null,
    });
    const room = await useAsHero(old.id, "PUBLISHED");
    await client.siteSettings.create({
      data: { id: "default", siteName: "Rivana", defaultOgMediaId: old.id },
    });
    const replacement = await readyImage("#222222");

    const result = await library.replace(editor, old.id, replacement.id);

    expect(result).toMatchObject({ ok: true, value: { replaced: 2 } });
    expect(
      await client.roomMedia.findFirst({ where: { roomId: room.id } }),
    ).toMatchObject({
      mediaId: replacement.id,
    });
    expect(await client.siteSettings.findFirst()).toMatchObject({
      defaultOgMediaId: replacement.id,
    });
    expect(
      await client.mediaAsset.findUnique({ where: { id: replacement.id } }),
    ).toMatchObject({
      altText: "Nile Suite bedroom",
      caption: "Evening",
    });
    expect(await media.countUsage(old.id)).toBe(0);
    expect(cache.invalidate).toHaveBeenCalledWith(
      expect.arrayContaining(["rooms", `room:${room.slug}`, "site-settings"]),
    );
  });

  it("will not put an unconfirmed image on published content", async () => {
    const old = await readyImage("#111111");
    await useAsHero(old.id, "PUBLISHED");
    const replacement = await readyImage("#222222");
    await client.mediaAsset.update({
      where: { id: replacement.id },
      data: { rightsStatus: "UNCONFIRMED" },
    });

    expect(await library.replace(editor, old.id, replacement.id)).toMatchObject(
      {
        ok: false,
        error: { code: "NOT_PUBLISHABLE" },
      },
    );
    expect(await media.countUsage(old.id)).toBe(1);
  });

  it("blocks publishing content that uses an image with unconfirmed rights", async () => {
    const asset = await readyImage();
    await client.mediaAsset.update({
      where: { id: asset.id },
      data: { rightsStatus: "UNCONFIRMED", altText: "Bedroom" },
    });
    const room = await useAsHero(asset.id);
    const rooms = new PrismaRoomRepository(client);

    const blocked = await rooms.publish(room.id, actor);
    expect(blocked).toMatchObject({
      ok: false,
      error: { code: "NOT_PUBLISHABLE" },
    });
    expect(JSON.stringify(!blocked.ok && blocked.error.fieldErrors)).toContain(
      "usage rights are confirmed",
    );

    expect(
      await library.setRights(editor, asset.id, "CONFIRMED"),
    ).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect((await library.setRights(admin, asset.id, "CONFIRMED")).ok).toBe(
      true,
    );
    expect((await rooms.publish(room.id, actor)).ok).toBe(true);
    expect(
      await library.setRights(admin, asset.id, "UNCONFIRMED"),
    ).toMatchObject({
      ok: false,
      error: { code: "NOT_PUBLISHABLE" },
    });
  });

  it("validates and saves alt text, caption, credit, and focal point", async () => {
    const asset = await readyImage();
    expect(
      await library.updateDetails(editor, asset.id, {
        altText: "Pool at dusk",
        caption: "",
        credit: "Studio A",
        focalX: "30",
        focalY: "70",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        altText: "Pool at dusk",
        caption: null,
        credit: "Studio A",
        focalX: 0.3,
        focalY: 0.7,
      },
    });
    expect(
      await library.updateDetails(editor, asset.id, {
        altText: "",
        focalX: "150",
        focalY: "",
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
});

describe("cleanup", () => {
  it("fails abandoned uploads and removes stray quarantine files", async () => {
    await client.mediaAsset.create({
      data: {
        id: "stalepending1",
        storageProvider: "local",
        storageContainer: "media",
        storageKey: "images/2026/09/stalepending1.png",
        originalFilename: "a.png",
        mimeType: "image/png",
        bytes: 10,
        altText: "",
        status: "PENDING",
        createdAt: new Date("2026-09-25T09:00:00Z"),
      },
    });
    async function* one() {
      yield new Uint8Array([1, 2, 3]);
    }
    await storage.writeQuarantine("stalepending1", one(), 10);
    await storage.writeQuarantine("orphanupload1", one(), 10);
    await writeFile(path.join(root, "quarantine", "not-an-upload.txt"), "x");

    const report = await new CleanupMedia(deps, {
      now: () => new Date(Date.now() + 2 * 60 * 60 * 1000),
    }).execute();

    expect(report).toMatchObject({
      abandonedUploads: 1,
      orphanedQuarantine: 1,
      errors: 0,
    });
    expect(
      await client.mediaAsset.findUnique({ where: { id: "stalepending1" } }),
    ).toMatchObject({
      status: "FAILED",
      failureReason: "The upload did not finish.",
    });
    expect(await storage.listQuarantine()).toEqual([]);
  });

  it("purges old failed records", async () => {
    await upload(await image("png"), "x.jpg", "image/jpeg");
    await client.mediaAsset.updateMany({
      data: { updatedAt: new Date("2026-01-01T00:00:00Z") },
    });
    const report = await new CleanupMedia(deps, deps.clock).execute();
    expect(report.purgedFailed).toBe(1);
    expect(await client.mediaAsset.count()).toBe(0);
  });
});

describe("reference asset import", () => {
  const entries = [
    {
      source: "design/assets/images/pool-main.jpg",
      decision: "IMPORT",
      rights: "UNCONFIRMED",
      altDraft: "Indoor swimming pool lit by warm wall lights",
    },
    {
      source: "design/assets/images/pool-02.jpg",
      decision: "DUPLICATE",
      rights: "UNCONFIRMED",
      altDraft: "Overhead view of the pool",
    },
    {
      source: "design/assets/images/amenity-spa.jpg",
      decision: "EXCLUDED",
      rights: "UNCONFIRMED",
      altDraft: "Spa arrangement",
    },
  ].map((entry) => ({
    ...entry,
    sha256: "",
    width: 0,
    height: 0,
    bytes: 0,
    format: "jpeg",
    intendedUsage: "Test",
    duplicateOf: null,
    notes: "",
  })) as Parameters<typeof importReferenceAssets>[1];
  const read = async (source: string) =>
    new Uint8Array(
      await import("node:fs/promises").then((fs) => fs.readFile(source)),
    );

  it("imports only approved entries unless unconfirmed ones are allowed", async () => {
    const strict = await importReferenceAssets(deps, entries, read, {
      allowUnconfirmed: false,
    });
    expect(strict.map((outcome) => outcome.result)).toEqual([
      "SKIPPED",
      "SKIPPED",
      "SKIPPED",
    ]);
    expect(await client.mediaAsset.count()).toBe(0);
  });

  it("imports through the same checks, keeps provenance, and is idempotent", async () => {
    const first = await importReferenceAssets(deps, entries, read, {
      allowUnconfirmed: true,
    });
    expect(first.map((outcome) => outcome.result)).toEqual([
      "IMPORTED",
      "SKIPPED",
      "SKIPPED",
    ]);
    expect(await client.mediaAsset.findFirst()).toMatchObject({
      status: "READY",
      rightsStatus: "UNCONFIRMED",
      sourceReference: "reference:design/assets/images/pool-main.jpg",
      altText: "Indoor swimming pool lit by warm wall lights",
      createdById: null,
    });

    const second = await importReferenceAssets(deps, entries, read, {
      allowUnconfirmed: true,
    });
    expect(second[0]?.result).toBe("ALREADY_IMPORTED");
    expect(await client.mediaAsset.count()).toBe(1);
  });
});

describe("placing images", () => {
  it("enforces each section's image slots and keeps a published page publishable", async () => {
    const { seedDatabase } = await import("../../prisma/seed-data");
    const { PrismaPageRepository } = await import(
      "@/infrastructure/db/prisma/repositories/page-repository"
    );
    await seedDatabase(client);
    const pages = new PrismaPageRepository(client);
    const home = await pages.findAdminByKey("HOME");
    const hero = home!.sections.find((section) => section.type === "HERO")!;
    const roomGrid = home!.sections.find(
      (section) => section.type === "ROOM_GRID",
    )!;
    const one = await readyImage("#111111");
    const two = await readyImage("#222222");

    expect(
      await pages.replaceSectionMedia(
        "HOME",
        hero.id,
        [
          {
            mediaId: one.id,
            role: "BACKGROUND",
            sortOrder: 0,
            altOverride: null,
          },
          {
            mediaId: two.id,
            role: "BACKGROUND",
            sortOrder: 1,
            altOverride: null,
          },
        ],
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await pages.replaceSectionMedia(
        "HOME",
        roomGrid.id,
        [{ mediaId: one.id, role: "GALLERY", sortOrder: 0, altOverride: null }],
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });

    await client.page.update({
      where: { key: "HOME" },
      data: { isPublished: true },
    });
    // One image has no alt text, which a published page cannot show.
    await client.mediaAsset.update({
      where: { id: two.id },
      data: { altText: "" },
    });
    expect(
      await pages.replaceSectionMedia(
        "HOME",
        hero.id,
        [
          {
            mediaId: two.id,
            role: "BACKGROUND",
            sortOrder: 0,
            altOverride: null,
          },
        ],
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_PUBLISHABLE" } });
    expect(await client.pageSectionMedia.count()).toBe(0);

    const saved = await pages.replaceSectionMedia(
      "HOME",
      hero.id,
      [
        {
          mediaId: one.id,
          role: "BACKGROUND",
          sortOrder: 0,
          altOverride: "Lobby at dawn",
        },
      ],
      actor,
    );
    expect(saved.ok && saved.value.sections[0]?.media).toEqual([
      expect.objectContaining({
        id: one.id,
        role: "BACKGROUND",
        altOverride: "Lobby at dawn",
      }),
    ]);
  });

  it("accepts only ready images as sharing and brand images", async () => {
    const { PrismaSettingsRepository } = await import(
      "@/infrastructure/db/prisma/repositories/settings-repository"
    );
    const asset = await readyImage();
    const pending = await client.mediaAsset.create({
      data: {
        id: "pendingimage1",
        storageProvider: "local",
        storageContainer: "media",
        storageKey: "images/2026/09/pendingimage1.png",
        originalFilename: "a.png",
        mimeType: "image/png",
        bytes: 10,
        altText: "",
        status: "PENDING",
      },
    });
    const room = await createRoom(client);
    const rooms = new PrismaRoomRepository(client);
    expect(
      await rooms.setSocialImage(room.id, pending.id, actor),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await rooms.setSocialImage(room.id, asset.id, actor)).toMatchObject({
      ok: true,
      value: { ogMediaId: asset.id },
    });

    await client.siteSettings.create({
      data: { id: "default", siteName: "Rivana" },
    });
    const settings = new PrismaSettingsRepository(client);
    expect(
      await settings.updateImages(
        {
          logoMediaId: asset.id,
          stickyLogoMediaId: null,
          faviconMediaId: null,
          defaultOgMediaId: pending.id,
        },
        actor,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await settings.updateImages(
        {
          logoMediaId: asset.id,
          stickyLogoMediaId: null,
          faviconMediaId: null,
          defaultOgMediaId: asset.id,
        },
        actor,
      ),
    ).toMatchObject({
      ok: true,
      value: { logoMediaId: asset.id, defaultOgMediaId: asset.id },
    });
  });
});
