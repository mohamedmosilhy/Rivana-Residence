// Publishes a small, realistic public site into the disposable E2E database
// using the real repositories and the real image pipeline, so public-route
// tests exercise the same code as production. Brand copy follows the legacy
// site; contact details and room facts are test content.
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Actor } from "../../../src/application/ports/repositories.ts";
import {
  importReferenceAssets,
  type ManifestEntry,
} from "../../../src/application/media/import-reference-assets.ts";
import { richTextFromEditorText } from "../../../src/domain/shared/rich-text.ts";
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { PrismaFacilityRepository } from "../../../src/infrastructure/db/prisma/repositories/facility-repository.ts";
import { PrismaMediaRepository } from "../../../src/infrastructure/db/prisma/repositories/media-repository.ts";
import { PrismaPageRepository } from "../../../src/infrastructure/db/prisma/repositories/page-repository.ts";
import { PrismaRoomRepository } from "../../../src/infrastructure/db/prisma/repositories/room-repository.ts";
import { Cuid2IdGenerator } from "../../../src/infrastructure/ids/cuid2-id-generator.ts";
import { LocalMediaStorage } from "../../../src/infrastructure/media/local-media-storage.ts";
import { NodeHasher } from "../../../src/infrastructure/media/node-hasher.ts";
import { SharpImageProcessor } from "../../../src/infrastructure/media/sharp-image-processor.ts";

const IMAGES = [
  "home-hero.jpg",
  "about-exterior.jpg",
  "about-exterior-wide.jpg",
  "pool-main.jpg",
  "pool-gallery-01.jpg",
  "pool-gallery-02.jpg",
  "pool-gallery-04.jpg",
  "gym-main.jpg",
  "gym-gallery-01.jpg",
  "gym-gallery-02.jpg",
  "gym-gallery-04.jpg",
  "room-gallery-01.jpg",
  "room-gallery-02.jpg",
  "room-gallery-06.jpg",
  "room-gallery-08.jpg",
  "room-double.jpg",
  "room-pool.jpg",
  "room-superior-1.jpg",
  "room-superior-3.jpg",
  "room-superior-5.jpg",
  "room-superior-8.jpg",
];

function ok<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
) {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export async function seedPublicContent(
  client: PrismaClient,
  mediaRoot: string,
  actor: Actor,
) {
  const media = new PrismaMediaRepository(client);
  const { entries } = JSON.parse(
    await readFile("media-import/reference-manifest.json", "utf8"),
  ) as { entries: ManifestEntry[] };
  const wanted = entries.filter((entry) =>
    IMAGES.includes(path.basename(entry.source)),
  );
  const outcomes = await importReferenceAssets(
    {
      media,
      storage: await LocalMediaStorage.create(mediaRoot),
      images: new SharpImageProcessor(),
      hasher: new NodeHasher(),
      ids: new Cuid2IdGenerator(),
      clock: { now: () => new Date() },
    },
    wanted,
    async (source) => new Uint8Array(await readFile(source)),
    { allowUnconfirmed: true },
  );
  const image: Record<string, string> = {};
  for (const outcome of outcomes) {
    if (!outcome.asset)
      throw new Error(
        `Fixture image failed: ${outcome.source} ${outcome.detail}`,
      );
    image[path.basename(outcome.source)] = outcome.asset.id;
  }
  // Test fixtures stand in for client-approved images.
  await client.mediaAsset.updateMany({
    where: { id: { in: Object.values(image) } },
    data: { rightsStatus: "CONFIRMED" },
  });

  await client.siteSettings.update({
    where: { id: "default" },
    data: {
      tagline: "Luxury is a state of mind, and here, it's our reality.",
      phone: "+20 2 1234 5678",
      email: "stay@example.test",
      addressLine1: "Opposite the American University in Cairo",
      city: "Fifth Settlement, New Cairo",
      country: "Egypt",
      latitude: 30.0131,
      longitude: 31.4913,
      footerText: "© Rivana Residence. Test site.",
      defaultSeoDescription: "Rivana Residence test site.",
    },
  });

  const rooms = new PrismaRoomRepository(client);
  const room = async (
    input: Parameters<typeof rooms.create>[0],
    hero: string,
    gallery: string[],
    status: "PUBLISHED" | "DRAFT" | "ARCHIVED",
  ) => {
    const created = ok(await rooms.create(input, actor));
    ok(
      await rooms.replaceMedia(
        created.id,
        [
          {
            mediaId: image[hero]!,
            role: "HERO",
            sortOrder: 0,
            altOverride: null,
          },
          ...gallery.map((file, index) => ({
            mediaId: image[file]!,
            role: "GALLERY" as const,
            sortOrder: index,
            altOverride: null,
          })),
        ],
        actor,
      ),
    );
    if (status !== "DRAFT") ok(await rooms.publish(created.id, actor));
    if (status === "ARCHIVED") ok(await rooms.archive(created.id, actor));
  };
  const description = (text: string) => richTextFromEditorText(text);
  await room(
    {
      name: "Studio with Balcony",
      slug: "studio-with-balcony",
      shortDescription: "A bright studio with its own balcony and kitchenette.",
      description: description(
        "A calm, light-filled studio for longer stays, with twin beds set against a wood-panelled wall and a private balcony over the neighbourhood.\n\nThe kitchenette and work desk make it easy to settle in, whether you are here for business or a family visit.\n\n## In the studio\n\n- Kitchenette\n- Work desk\n- Private balcony",
      ),
      sizeSqm: 38,
      maxAdults: 2,
      maxChildren: 1,
      bedSummary: "Two single beds",
      viewSummary: "Neighbourhood view",
      features: [
        { label: "Balcony" },
        { label: "Kitchenette" },
        { label: "Rain shower" },
      ],
      featured: true,
    },
    "room-gallery-08.jpg",
    ["room-gallery-01.jpg", "room-gallery-02.jpg", "room-gallery-06.jpg"],
    "PUBLISHED",
  );
  await room(
    {
      name: "Deluxe Double",
      slug: "deluxe-double",
      shortDescription:
        "A double room with a wood-panelled wall and seating corner.",
      description: description(
        "Warm wood, soft lighting, and space to unwind. A generous double bed faces a seating corner, with a desk for quiet mornings.",
      ),
      sizeSqm: 32,
      maxAdults: 2,
      maxChildren: 0,
      bedSummary: "One double bed",
      viewSummary: null,
      featured: true,
    },
    "room-double.jpg",
    ["room-superior-1.jpg", "room-superior-3.jpg", "room-superior-5.jpg"],
    "PUBLISHED",
  );
  await room(
    {
      name: "Superior Double",
      slug: "superior-double",
      shortDescription:
        "A wood-panelled double with a desk, armchair, and walk-in rain shower.",
      description: description(
        "Our most spacious double, finished in warm wood with a separate seating corner and a walk-in rain shower.",
      ),
      sizeSqm: 36,
      maxAdults: 2,
      maxChildren: 1,
      bedSummary: "One king bed",
      viewSummary: null,
      features: [
        { label: "Work desk" },
        { label: "Seating corner" },
        { label: "Rain shower" },
      ],
      featured: true,
    },
    "room-pool.jpg",
    ["room-superior-3.jpg", "room-superior-5.jpg", "room-superior-8.jpg"],
    "PUBLISHED",
  );
  await room(
    {
      name: "Private Draft Room",
      slug: "private-draft-room",
      shortDescription: "Not public yet.",
      description: description("Draft."),
      sizeSqm: null,
      maxAdults: 2,
      maxChildren: 0,
      bedSummary: null,
      viewSummary: null,
      featured: true,
    },
    "room-double.jpg",
    [],
    "DRAFT",
  );
  await room(
    {
      name: "Retired Room",
      slug: "retired-room",
      shortDescription: "No longer offered.",
      description: description("Archived."),
      sizeSqm: null,
      maxAdults: 2,
      maxChildren: 0,
      bedSummary: null,
      viewSummary: null,
      featured: false,
    },
    "room-double.jpg",
    [],
    "ARCHIVED",
  );

  const facilities = new PrismaFacilityRepository(client);
  const facility = async (
    input: Parameters<typeof facilities.create>[0],
    hero: string,
    gallery: string[],
    publish: boolean,
  ) => {
    const created = ok(await facilities.create(input, actor));
    ok(
      await facilities.replaceMedia(
        created.id,
        [
          {
            mediaId: image[hero]!,
            role: "HERO",
            sortOrder: 0,
            altOverride: null,
          },
          ...gallery.map((file, index) => ({
            mediaId: image[file]!,
            role: "GALLERY" as const,
            sortOrder: index,
            altOverride: null,
          })),
        ],
        actor,
      ),
    );
    if (publish) ok(await facilities.publish(created.id, actor));
  };
  await facility(
    {
      name: "Swimming Pool",
      slug: "swimming-pool",
      shortDescription: "Unwind and refresh in a serene poolside escape.",
      description: description(
        "Unwind and refresh at Rivana Residence with our indoor swimming pool, the perfect escape for relaxation and leisure.\n\nWarm wall lights and a natural stone wall set a calm mood from the first swim of the morning to the last of the evening.",
      ),
      openingHoursText: "Daily 8:00–20:00",
      featured: true,
    },
    "pool-main.jpg",
    ["pool-gallery-02.jpg", "pool-gallery-01.jpg", "pool-gallery-04.jpg"],
    true,
  );
  await facility(
    {
      name: "Fitness Room",
      slug: "fitness-room",
      shortDescription: "Modern fitness meets the comfort of your stay.",
      description: description(
        "Keep up your routine while you stay. The fitness room has treadmills, an exercise bike, free weights, and a multi-station weight machine.",
      ),
      openingHoursText: null,
      featured: true,
    },
    "gym-main.jpg",
    ["gym-gallery-01.jpg", "gym-gallery-02.jpg", "gym-gallery-04.jpg"],
    true,
  );
  await facility(
    {
      name: "Spa",
      slug: "spa",
      shortDescription: "Not confirmed.",
      description: description("Draft."),
      openingHoursText: null,
      featured: false,
    },
    "pool-main.jpg",
    [],
    false,
  );

  const pages = new PrismaPageRepository(client);
  const configure = async (
    key: "HOME" | "ABOUT" | "CONTACT",
    edits: Record<
      string,
      {
        payload?: unknown;
        isVisible?: boolean;
        heading?: string | null;
        eyebrow?: string | null;
      }
    >,
    images: Record<
      string,
      { role: "BACKGROUND" | "PRIMARY" | "GALLERY"; files: string[] }
    > = {},
  ) => {
    const page = (await pages.findAdminByKey(key))!;
    for (const section of page.sections) {
      const edit = edits[section.type];
      if (edit) {
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
              payload: edit.payload ?? section.payload,
              isVisible: edit.isVisible ?? section.isVisible,
            },
            actor,
          ),
        );
      }
      const media = images[section.type];
      if (media) {
        ok(
          await pages.replaceSectionMedia(
            key,
            section.id,
            media.files.map((file, index) => ({
              mediaId: image[file]!,
              role: media.role,
              sortOrder: index,
              altOverride: null,
            })),
            actor,
          ),
        );
      }
    }
    ok(await pages.publish(key, actor));
  };
  await configure(
    "HOME",
    {
      HERO: {
        eyebrow: "Luxury hotel in New Cairo",
        payload: {
          schemaVersion: 1,
          title: "Rivana Residence",
          summary: "Luxury is a state of mind, and here, it's our reality.",
          cta: { label: "Book your stay", intent: "BOOKING" },
        },
      },
      RICH_TEXT: {
        heading: "Living your experience",
        eyebrow: "Welcome",
        payload: {
          schemaVersion: 1,
          document: description(
            "We at Rivana Residence are pleased to welcome you to our network of distinguished guests. We look forward to your stay at one of the finest hospitality destinations in New Cairo.",
          ),
        },
      },
      ROOM_GRID: {
        heading: "Our rooms",
        eyebrow: "Enchanted with elegance",
        payload: { schemaVersion: 1, limit: 3, featuredOnly: false },
      },
      FACILITY_GRID: {
        heading: "Our amenities",
        eyebrow: "Life at Rivana",
        payload: { schemaVersion: 1, limit: 3, featuredOnly: false },
      },
      IMAGE_TEXT_SPLIT: {
        heading: "Rest well. Sleep well.",
        eyebrow: "Your stay",
        isVisible: true,
        payload: {
          schemaVersion: 1,
          body: description(
            "We are confident in delivering a unique experience to you and your valued guests in the Fifth Settlement, New Cairo.\n\nQuiet rooms, warm wood, and attentive service make every stay feel effortless.",
          ),
          imageSide: "RIGHT",
          cta: { label: "Explore the rooms", intent: "ROOMS" },
        },
      },
      CONTACT_CTA: {
        heading: "Plan your stay",
        eyebrow: "Contact",
        payload: {
          schemaVersion: 1,
          body: "Questions about your stay? Write to us and our team will reply by email.",
          formEnabled: true,
        },
      },
    },
    {
      HERO: { role: "BACKGROUND", files: ["home-hero.jpg"] },
      IMAGE_TEXT_SPLIT: { role: "PRIMARY", files: ["room-superior-1.jpg"] },
    },
  );
  await configure(
    "ABOUT",
    {
      HERO: {
        eyebrow: "Welcome to Rivana Residence",
        payload: {
          schemaVersion: 1,
          title: "About Rivana",
          summary: "Make your stay memorable.",
        },
      },
      IMAGE_TEXT_SPLIT: {
        eyebrow: "Our story",
        heading: "A haven of comfort, style, and hospitality",
        payload: {
          schemaVersion: 1,
          body: description(
            "We at Rivana Residence are pleased to welcome you to our network of distinguished guests, at one of the finest hospitality destinations in New Cairo, opposite the American University and El Zohour Club.\n\nRivana Residence combines comfort and a strategic location, making it the ideal choice for business and leisure travellers alike.",
          ),
          imageSide: "LEFT",
        },
      },
      STATS: {
        isVisible: true,
        payload: {
          schemaVersion: 1,
          items: [
            { value: "28", label: "Rooms" },
            { value: "30", label: "Team members" },
            { value: "24/7", label: "Reception" },
          ],
        },
      },
      GALLERY: {
        isVisible: true,
        heading: "Around the residence",
        eyebrow: "Gallery",
        payload: { schemaVersion: 1, layout: "EDITORIAL" },
      },
      ROOM_GRID: {
        isVisible: true,
        heading: "Our rooms",
        eyebrow: "Enchanted with elegance",
        payload: { schemaVersion: 1, limit: 3, featuredOnly: false },
      },
      CONTACT_CTA: {
        heading: "Plan your stay",
        eyebrow: "Contact",
        payload: {
          schemaVersion: 1,
          body: "Tell us when you would like to visit and we will help you choose the right room.",
          formEnabled: false,
        },
      },
    },
    {
      HERO: { role: "BACKGROUND", files: ["about-exterior-wide.jpg"] },
      IMAGE_TEXT_SPLIT: { role: "PRIMARY", files: ["about-exterior.jpg"] },
      GALLERY: {
        role: "GALLERY",
        files: [
          "gym-gallery-04.jpg",
          "room-superior-3.jpg",
          "room-gallery-06.jpg",
          "pool-gallery-04.jpg",
        ],
      },
    },
  );
  await configure("CONTACT", {
    HERO: {
      eyebrow: "We are here to help",
      payload: {
        schemaVersion: 1,
        title: "Contact us",
        summary: "We usually reply within a day.",
      },
    },
    CONTACT_CTA: {
      eyebrow: "Enquiries",
      payload: {
        schemaVersion: 1,
        body: "Send us a message and we will reply by email.",
        formEnabled: true,
      },
    },
  });
}
