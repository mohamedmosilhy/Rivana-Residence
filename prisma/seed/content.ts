import { readFile } from "node:fs/promises";
import path from "node:path";

import { createId } from "@paralleldrive/cuid2";

import type { StaffPrincipal } from "../../src/application/auth/ports.ts";
import { MediaLibrary } from "../../src/application/media/media-library.ts";
import { richTextFromEditorText } from "../../src/domain/shared/rich-text.ts";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { PrismaFacilityRepository } from "../../src/infrastructure/db/prisma/repositories/facility-repository.ts";
import { PrismaMediaRepository } from "../../src/infrastructure/db/prisma/repositories/media-repository.ts";
import { PrismaPageRepository } from "../../src/infrastructure/db/prisma/repositories/page-repository.ts";
import { PrismaRoomRepository } from "../../src/infrastructure/db/prisma/repositories/room-repository.ts";
import { Cuid2IdGenerator } from "../../src/infrastructure/ids/cuid2-id-generator.ts";
import { LocalMediaStorage } from "../../src/infrastructure/media/local-media-storage.ts";
import { NodeHasher } from "../../src/infrastructure/media/node-hasher.ts";
import { SharpImageProcessor } from "../../src/infrastructure/media/sharp-image-processor.ts";
import {
  FACILITIES,
  IMAGES,
  PAGES,
  ROOMS,
  SETTINGS,
  type ImageKey,
  type PageSeed,
} from "../initial-content/content.ts";

const IMAGE_DIR = path.join(
  import.meta.dirname,
  "..",
  "initial-content",
  "images",
);

function ok<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
  what: string,
): T {
  if (!result.ok) throw new Error(`${what}: ${result.error.message}`);
  return result.value;
}

async function uploadImages(
  client: PrismaClient,
  mediaRoot: string,
  staff: StaffPrincipal,
) {
  const media = new PrismaMediaRepository(client);
  const library = new MediaLibrary(
    {
      media,
      storage: await LocalMediaStorage.create(mediaRoot),
      images: new SharpImageProcessor(),
      hasher: new NodeHasher(),
      ids: new Cuid2IdGenerator(),
      clock: { now: () => new Date() },
    },
    // Nothing is cached yet: the public cache starts empty.
    { invalidate: async () => undefined },
  );
  const ids = {} as Record<ImageKey, string>;
  for (const [key, image] of Object.entries(IMAGES) as [
    ImageKey,
    (typeof IMAGES)[ImageKey],
  ][]) {
    const bytes = new Uint8Array(
      await readFile(path.join(IMAGE_DIR, image.file)),
    );
    const asset = ok(
      await library.upload(staff, {
        filename: image.file,
        declaredType: image.file.endsWith(".png") ? "image/png" : "image/jpeg",
        declaredBytes: bytes.byteLength,
        source: (async function* () {
          yield bytes;
        })(),
        // The residence's own photography from its previous website.
        rightsConfirmed: true,
      }),
      `Upload ${image.file}`,
    );
    ok(
      await library.updateDetails(staff, asset.id, {
        altText: image.alt,
        caption: "",
        credit: "Rivana Residence",
        focalX: "",
        focalY: "",
      }),
      `Describe ${image.file}`,
    );
    ids[key] = asset.id;
  }
  return ids;
}

/**
 * Uploads the old site's photography and creates its rooms, facilities, and
 * the published Home, About, and Contact pages. Callers run it only while the
 * database has no content, so CMS edits are never duplicated.
 */
export async function seedContent(
  client: PrismaClient,
  options: Readonly<{
    mediaRoot: string;
    staff: StaffPrincipal;
    branchId: string;
  }>,
) {
  const { mediaRoot, staff, branchId } = options;
  const image = await uploadImages(client, mediaRoot, staff);
  const actor = { id: staff.id, role: staff.role };
  const text = (value: string) => richTextFromEditorText(value);
  const entityMedia = (hero: ImageKey, gallery: readonly ImageKey[]) => [
    {
      mediaId: image[hero],
      role: "HERO" as const,
      sortOrder: 0,
      altOverride: null,
    },
    ...gallery.map((key, index) => ({
      mediaId: image[key],
      role: "GALLERY" as const,
      sortOrder: index,
      altOverride: null,
    })),
  ];

  const settings = await client.siteSettings.update({
    where: { id: "default" },
    data: {
      siteName: SETTINGS.siteName,
      tagline: SETTINGS.tagline,
      footerText: SETTINGS.footerText,
      defaultSeoTitle: SETTINGS.defaultSeoTitle,
      defaultSeoDescription: SETTINGS.defaultSeoDescription,
      faviconMediaId: image.crest,
      defaultOgMediaId: image.homeHero,
      updatedById: staff.id,
    },
  });
  await client.socialLink.deleteMany({
    where: { siteSettingsId: settings.id },
  });
  await client.socialLink.createMany({
    data: SETTINGS.socialLinks.map((link, index) => ({
      id: createId(),
      siteSettingsId: settings.id,
      ...link,
      sortOrder: index,
      isVisible: true,
    })),
  });

  const rooms = new PrismaRoomRepository(client);
  for (const room of ROOMS) {
    const created = ok(
      await rooms.create(
        branchId,
        {
          name: room.name,
          slug: room.slug,
          shortDescription: room.shortDescription,
          description: text(room.description),
          sizeSqm: room.sizeSqm,
          maxAdults: room.maxAdults,
          maxChildren: room.maxChildren,
          bedSummary: room.bedSummary,
          viewSummary: room.viewSummary,
          features: room.features.map((label) => ({ label })),
          featured: true,
        },
        actor,
      ),
      `Room ${room.name}`,
    );
    ok(
      await rooms.replaceMedia(
        created.id,
        entityMedia(room.hero, room.gallery),
        actor,
      ),
      `Room photos ${room.name}`,
    );
    ok(await rooms.publish(created.id, actor), `Publish ${room.name}`);
  }

  const facilities = new PrismaFacilityRepository(client);
  for (const facility of FACILITIES) {
    const created = ok(
      await facilities.create(
        branchId,
        {
          name: facility.name,
          slug: facility.slug,
          shortDescription: facility.shortDescription,
          description: text(facility.description),
          openingHoursText: facility.openingHoursText,
          featured: facility.featured,
        },
        actor,
      ),
      `Facility ${facility.name}`,
    );
    if (!facility.hero) continue;
    ok(
      await facilities.replaceMedia(
        created.id,
        entityMedia(facility.hero, facility.gallery),
        actor,
      ),
      `Facility photos ${facility.name}`,
    );
    ok(await facilities.publish(created.id, actor), `Publish ${facility.name}`);
  }

  const pages = new PrismaPageRepository(client);
  for (const key of ["HOME", "ABOUT", "CONTACT"] as const) {
    const edits: PageSeed = PAGES[key];
    const page = (await pages.findAdminByKey(branchId, key))!;
    for (const section of page.sections) {
      const edit = edits[section.type];
      if (!edit) continue;
      const body = edit.text ? text(edit.text) : undefined;
      const payload = {
        schemaVersion: 1,
        ...(section.type === "RICH_TEXT" && body ? { document: body } : {}),
        ...(section.type === "IMAGE_TEXT_SPLIT" && body ? { body } : {}),
        ...edit.payload,
      };
      ok(
        await pages.saveSection(
          branchId,
          key,
          {
            id: section.id,
            type: section.type,
            heading:
              edit.heading === undefined ? section.heading : edit.heading,
            eyebrow:
              edit.eyebrow === undefined ? section.eyebrow : edit.eyebrow,
            payload,
            isVisible: edit.isVisible ?? section.isVisible,
          },
          actor,
        ),
        `${key} ${section.type}`,
      );
      if (edit.image) {
        ok(
          await pages.replaceSectionMedia(
            branchId,
            key,
            section.id,
            edit.image.keys.map((imageKey, index) => ({
              mediaId: image[imageKey],
              role: edit.image!.role,
              sortOrder: index,
              altOverride: null,
            })),
            actor,
          ),
          `${key} ${section.type} photos`,
        );
      }
    }
    ok(await pages.publish(branchId, key, actor), `Publish ${key}`);
  }
}

export const SEEDED_COUNTS = {
  rooms: ROOMS.length,
  facilities: FACILITIES.length,
  images: Object.keys(IMAGES).length,
} as const;
