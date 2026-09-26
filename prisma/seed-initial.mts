// Seeds a fresh database with the previous rivanaresidence.com content
// (prisma/initial-content) and the initial administrator account.
//
//   npm run db:seed:initial
//
// Needs DATABASE_URL and MEDIA_STORAGE_ROOT. Safe to re-run: the admin is
// created only if missing (an existing password is never changed), and the
// content is added only while the database has no rooms, facilities, or
// images, so CMS edits are never duplicated or overwritten.
//
// The default admin password (123456) is for local and staging use. It is
// below the admin password policy, so in production the seed refuses it and
// requires SEED_ADMIN_PASSWORD, which must pass the policy.
import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createId } from "@paralleldrive/cuid2";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";

import type { StaffPrincipal } from "../src/application/auth/ports.ts";
import { MediaLibrary } from "../src/application/media/media-library.ts";
import { passwordPolicyIssues } from "../src/domain/auth/password-policy.ts";
import { richTextFromEditorText } from "../src/domain/shared/rich-text.ts";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaFacilityRepository } from "../src/infrastructure/db/prisma/repositories/facility-repository.ts";
import { PrismaMediaRepository } from "../src/infrastructure/db/prisma/repositories/media-repository.ts";
import { PrismaPageRepository } from "../src/infrastructure/db/prisma/repositories/page-repository.ts";
import { PrismaRoomRepository } from "../src/infrastructure/db/prisma/repositories/room-repository.ts";
import { Cuid2IdGenerator } from "../src/infrastructure/ids/cuid2-id-generator.ts";
import { LocalMediaStorage } from "../src/infrastructure/media/local-media-storage.ts";
import { NodeHasher } from "../src/infrastructure/media/node-hasher.ts";
import { SharpImageProcessor } from "../src/infrastructure/media/sharp-image-processor.ts";
import {
  FACILITIES,
  IMAGES,
  PAGES,
  ROOMS,
  SETTINGS,
  type ImageKey,
  type PageSeed,
} from "./initial-content/content.ts";
import { seedDatabase } from "./seed-data.ts";

const ADMIN = {
  email: "admin@rivanaresidence.com",
  name: "Rivana Admin",
  defaultPassword: "123456",
};
const IMAGE_DIR = path.join(import.meta.dirname, "initial-content", "images");

const url = process.env.DATABASE_URL;
const mediaRoot = process.env.MEDIA_STORAGE_ROOT;
if (!url) throw new Error("DATABASE_URL is required.");
if (!mediaRoot) throw new Error("MEDIA_STORAGE_ROOT is required.");

const production = process.env.NODE_ENV === "production";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? ADMIN.defaultPassword;
if (production) {
  const issues = process.env.SEED_ADMIN_PASSWORD
    ? passwordPolicyIssues(adminPassword, ADMIN)
    : ["Set SEED_ADMIN_PASSWORD; the default password is not allowed."];
  if (issues.length > 0) {
    throw new Error(`Refusing to seed production: ${issues.join(" ")}`);
  }
}

function ok<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
  what: string,
): T {
  if (!result.ok) throw new Error(`${what}: ${result.error.message}`);
  return result.value;
}

const client = new PrismaClient({
  // Timestamps must round-trip in UTC; see src/infrastructure/db/prisma/client.ts.
  adapter: new PrismaPg({ connectionString: url, options: "-c TimeZone=UTC" }),
});

async function ensureAdmin() {
  const existing = await client.user.findUnique({
    where: { email: ADMIN.email },
  });
  if (existing) {
    console.log(`Admin ${ADMIN.email} already exists; password unchanged.`);
    return existing;
  }
  const id = createId();
  const user = await client.user.create({
    data: {
      id,
      email: ADMIN.email,
      name: ADMIN.name,
      role: "ADMIN",
      active: true,
      emailVerified: true,
      accounts: {
        create: {
          id: createId(),
          providerId: "credential",
          accountId: id,
          password: await hashPassword(adminPassword),
        },
      },
    },
  });
  console.log(`Created admin ${ADMIN.email}.`);
  return user;
}

async function uploadImages(staff: StaffPrincipal) {
  const media = new PrismaMediaRepository(client);
  const library = new MediaLibrary(
    {
      media,
      storage: await LocalMediaStorage.create(mediaRoot!),
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

async function seedContent(staff: StaffPrincipal) {
  const image = await uploadImages(staff);
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
      phone: SETTINGS.phone,
      email: SETTINGS.email,
      addressLine1: SETTINGS.addressLine1,
      addressLine2: SETTINGS.addressLine2,
      city: SETTINGS.city,
      country: SETTINGS.country,
      latitude: SETTINGS.latitude,
      longitude: SETTINGS.longitude,
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
    const page = (await pages.findAdminByKey(key))!;
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
    ok(await pages.publish(key, actor), `Publish ${key}`);
  }
}

try {
  // Settings, the three managed pages, and their default sections.
  await seedDatabase(client);
  const admin = await ensureAdmin();
  const staff: StaffPrincipal = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: "ADMIN",
    sessionId: "seed",
  };

  const [rooms, facilities, media] = await Promise.all([
    client.room.count(),
    client.facility.count(),
    client.mediaAsset.count(),
  ]);
  if (rooms + facilities + media > 0) {
    console.log(
      `Content skipped: the database already has ${rooms} rooms, ${facilities} facilities, and ${media} images.`,
    );
  } else {
    await seedContent(staff);
    console.log(
      `Seeded ${ROOMS.length} rooms, ${FACILITIES.length} facilities (the Café stays a draft until it has a photo), ${Object.keys(IMAGES).length} images, and the Home, About, and Contact pages.`,
    );
  }
  console.log(
    "If the site is running, delete .next/cache/fetch-cache and .next/dev/cache/fetch-cache, then reload.",
  );
} finally {
  await client.$disconnect();
}
