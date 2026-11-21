import { PrismaBranchRepository } from "../../src/infrastructure/db/prisma/repositories/branches/branch-repository.ts";
import { PrismaFacilityRepository } from "../../src/infrastructure/db/prisma/repositories/facility-repository.ts";
import { PrismaPageRepository } from "../../src/infrastructure/db/prisma/repositories/page-repository.ts";
import { PrismaRoomRepository } from "../../src/infrastructure/db/prisma/repositories/room-repository.ts";
import {
  REQUIRED_PAGES,
  defaultPageSections,
} from "../../src/domain/content/default-sections.ts";
import { richTextFromEditorText } from "../../src/domain/shared/rich-text.ts";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { IMAGES, type ImageKey } from "../initial-content/content.ts";

export const DEMO_BRANCH_SLUG = "demo-giza";
const DEMO_BRANCH_NAME = "Rivana Giza (demo)";

// Fixed CUID2 fixture identities survive label/rate edits and reruns.
const INVENTORY_FIXTURES = [
  {
    slug: "giza-garden-room",
    units: [
      { id: "xrrak1qqdghqceomhwi7qxf3", label: "DEMO-R101" },
      { id: "olykhmme4g8okk4hg10ytppz", label: "DEMO-R102" },
    ],
    baseMinor: 6000,
    periodId: "pzxtjg48tips90xlu6yhzulc",
    periodMinor: 7000,
  },
  {
    slug: "giza-family-apartment",
    units: [
      { id: "kv6yjbuqcdt728wvwxsumkmj", label: "DEMO-A201" },
      { id: "uyg16a8szhvapwnflhnvht0w", label: "DEMO-A202" },
      { id: "wm14iiyl2t1vbl0rkup16482", label: "DEMO-A203" },
    ],
    baseMinor: 10000,
    periodId: "o9jq9gupykn0kts7wkymhw8j",
    periodMinor: 12000,
  },
] as const;

/** M6 upgrade for fresh AND existing demo branches, never the real branch. */
export async function seedDemoInventory(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    const branch = await tx.branch.findUniqueOrThrow({
      where: { slug: DEMO_BRANCH_SLUG },
      select: { id: true },
    });
    // Resolve every target first so a missing listing cannot leave half an upgrade.
    const targets = await Promise.all(
      INVENTORY_FIXTURES.map(async (fixture) => ({
        fixture,
        room: await tx.room
          .findFirstOrThrow({
            where: { branchId: branch.id, slug: fixture.slug },
            select: { id: true },
          })
          .catch(() => {
            throw new Error(
              `Demo inventory needs the listing "${fixture.slug}" in ${DEMO_BRANCH_SLUG}; it was renamed or deleted.`,
            );
          }),
      })),
    );
    let created = 0;
    for (const { fixture, room } of targets) {
      const units = await tx.physicalRoom.createMany({
        data: fixture.units.map((unit) => ({
          ...unit,
          branchId: branch.id,
          roomTypeId: room.id,
          notes: "Fictional unit for local review only.",
        })),
        skipDuplicates: true,
      });
      const base = await tx.roomBaseRate.createMany({
        data: [
          {
            roomTypeId: room.id,
            amountMinor: fixture.baseMinor,
            currency: "USD",
          },
        ],
        skipDuplicates: true,
      });
      const period = await tx.ratePeriod.createMany({
        data: [
          {
            id: fixture.periodId,
            roomTypeId: room.id,
            startDate: new Date("2027-01-01T00:00:00Z"),
            endDate: new Date("2027-02-01T00:00:00Z"),
            amountMinor: fixture.periodMinor,
            currency: "USD",
            label: "Fictional demo period",
          },
        ],
        skipDuplicates: true,
      });
      created += units.count + base.count + period.count;
    }
    return { created };
  });
}

/** M7 commercial fixtures for new and existing demo branches only. */
export async function seedDemoCommercial(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    const branch = await tx.branch.findUniqueOrThrow({
      where: { slug: DEMO_BRANCH_SLUG },
      select: { id: true },
    });
    const offerings = await tx.serviceOffering.createMany({
      data: [
        {
          id: "zpcjlpacqrgstnaqwvkbbgxa",
          branchId: branch.id,
          kind: "BREAKFAST",
          priceUnit: "PER_PERSON_PER_NIGHT",
          priceMinor: 1000,
          childPriceMinor: 500,
          active: true,
          description:
            "Fictional demo breakfast prices, USD 10 adult / USD 5 child.",
        },
        {
          id: "vyxzpjrqblkqwznstafmgcde",
          branchId: branch.id,
          kind: "AIRPORT_TRANSFER",
          maxVehicles: 3,
          priceUnit: "PER_BOOKING",
          priceMinor: 3000,
          active: true,
          description: "Fictional demo transfer price, USD 30 per booking.",
        },
      ],
      skipDuplicates: true,
    });
    let created = offerings.count;
    for (const fixture of [
      {
        id: "qnstbvgcfalkrmwxpzhedjua",
        code: "DEMO_PERCENT",
        kind: "PERCENT" as const,
        percentBasisPoints: 1000,
        description: "Fictional demo coupon, 10 percent at demo-giza only.",
      },
      {
        id: "pxwkqbjvntcsgzlafmherdua",
        code: "DEMO_FIXED",
        kind: "FIXED" as const,
        amountMinor: 1500,
        description: "Fictional demo coupon, USD 15 at demo-giza only.",
      },
    ]) {
      // Do not restore edited values or branch links. A conflicting code
      // owned by another record fails the transaction, never adopts that code.
      if (await tx.coupon.findUnique({ where: { id: fixture.id } })) continue;
      await tx.coupon.create({
        data: {
          ...fixture,
          allBranches: false,
          branches: { create: { branchId: branch.id } },
        },
      });
      created += 1;
    }
    return { created };
  });
}

// The photos the demo uses, all from the real seeded library.
const DEMO_PHOTOS = [
  "exteriorWide",
  "exterior",
  "double1",
  "double3",
  "twin1",
  "twin2",
  "pool01",
  "gym02",
] as const satisfies readonly ImageKey[];

function ok<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
  what: string,
): T {
  if (!result.ok) throw new Error(`${what}: ${result.error.message}`);
  return result.value;
}

/**
 * Demo data, only with `--demo` (never in production): a fictional second
 * branch, `demo-giza`, so the branch chooser, the switcher, and branch
 * isolation can be tried locally. It has its own pages, two facilities, one
 * room, and one apartment, and it reuses the real photos already in the
 * media library (the demo only needs to prove the features work).
 *
 * M6 units and rates run separately via seedDemoInventory, including for
 * existing branches. M7 services and coupons use seedDemoCommercial; M8
 * guests and reservations use seedDemoReservations, each with a test.
 * Returns whether it created the branch; an existing one is left alone.
 */
export async function seedDemo(
  client: PrismaClient,
  options: Readonly<{ staffId: string }>,
): Promise<Readonly<{ created: boolean; status: "ACTIVE" | "INACTIVE" }>> {
  const existing = await client.branch.findUnique({
    where: { slug: DEMO_BRANCH_SLUG },
  });
  if (existing) return { created: false, status: existing.status };

  // Every photo is looked up before anything is written, so a missing one
  // can never leave half a branch behind.
  const assets = await client.mediaAsset.findMany({
    where: {
      status: "READY",
      originalFilename: { in: Object.values(IMAGES).map((item) => item.file) },
    },
    select: { id: true, originalFilename: true },
    orderBy: { createdAt: "asc" },
  });
  const byFile = new Map<string, string>();
  for (const asset of assets) {
    if (!byFile.has(asset.originalFilename)) {
      byFile.set(asset.originalFilename, asset.id);
    }
  }
  const missing = DEMO_PHOTOS.filter((key) => !byFile.has(IMAGES[key].file));
  if (missing.length > 0) {
    throw new Error(
      `The demo needs these seeded photos, which are missing or deleted: ${missing
        .map((key) => IMAGES[key].file)
        .join(", ")}. Nothing was created. Start again from an empty database.`,
    );
  }
  const image = (key: ImageKey) => byFile.get(IMAGES[key].file)!;

  const actor = { id: options.staffId, role: "ADMIN" as const };
  const created = ok(
    await new PrismaBranchRepository(client).create(
      {
        slug: DEMO_BRANCH_SLUG,
        name: DEMO_BRANCH_NAME,
        summary: "A fictional second branch for local review and tests.",
        status: "ACTIVE",
        timeZone: "Africa/Cairo",
        phone: "+20 2 9876 5432",
        email: "giza@example.test",
        addressLine1: "Demo Street 1",
        addressLine2: null,
        city: "Sheikh Zayed, Giza",
        country: "Egypt",
        latitude: 30.0444,
        longitude: 30.98,
        mapEmbedUrl: "https://www.google.com/maps/embed?pb=demo-giza",
        checkInTime: "14:00",
        checkOutTime: "12:00",
        syncReminderIntervalMinutes: 30,
        syncFollowUpMinutes: 10,
        heroMediaId: image("exteriorWide"),
        onlineBookingEnabled: false,
        sortOrder: 1,
      },
      REQUIRED_PAGES.map((page) => ({
        ...page,
        sections: defaultPageSections(page.key, DEMO_BRANCH_NAME),
      })),
      (branchId) => ({
        occurredAt: new Date(),
        actorType: "STAFF",
        actorId: options.staffId,
        action: "branch.created",
        entityType: "Branch",
        entityId: branchId,
        branchId,
        reason: null,
        changes: {
          slug: DEMO_BRANCH_SLUG,
          name: DEMO_BRANCH_NAME,
          status: "ACTIVE",
        },
      }),
    ),
    "Demo branch",
  );
  const branchId = created.id;
  const description = (text: string) => richTextFromEditorText(text);
  const withImages = async (
    repository: PrismaRoomRepository | PrismaFacilityRepository,
    id: string,
    hero: ImageKey,
    gallery: readonly ImageKey[],
  ) => {
    ok<unknown>(
      await repository.replaceMedia(
        id,
        [
          {
            mediaId: image(hero),
            role: "HERO",
            sortOrder: 0,
            altOverride: null,
          },
          ...gallery.map((key, index) => ({
            mediaId: image(key),
            role: "GALLERY" as const,
            sortOrder: index,
            altOverride: null,
          })),
        ],
        actor,
      ),
      "Demo photos",
    );
    ok<unknown>(await repository.publish(id, actor), "Demo publish");
  };

  const rooms = new PrismaRoomRepository(client);
  const room = ok(
    await rooms.create(
      branchId,
      {
        name: "Giza Garden Room",
        slug: "giza-garden-room",
        shortDescription: "A quiet double room over the garden.",
        description: description("A demo room at the fictional Giza branch."),
        sizeSqm: 30,
        maxAdults: 2,
        maxChildren: 0,
        bedSummary: "One double bed",
        viewSummary: "Garden view",
        features: [{ label: "Garden view" }],
        featured: true,
      },
      actor,
    ),
    "Demo room",
  );
  await withImages(rooms, room.id, "double1", ["double3"]);
  const apartment = ok(
    await rooms.create(
      branchId,
      {
        name: "Giza Family Apartment",
        slug: "giza-family-apartment",
        accommodationType: "APARTMENT",
        bedroomCount: 2,
        bathroomCount: 2,
        shortDescription: "Two bedrooms, a kitchen, and a living room.",
        description: description(
          "A demo hotel apartment for families, with a full kitchen and a living room.",
        ),
        sizeSqm: 85,
        maxAdults: 4,
        maxChildren: 2,
        bedSummary: "One king bed and two singles",
        viewSummary: null,
        features: [{ label: "Full kitchen" }, { label: "Living room" }],
        featured: true,
      },
      actor,
    ),
    "Demo apartment",
  );
  await withImages(rooms, apartment.id, "twin1", ["twin2"]);

  const facilities = new PrismaFacilityRepository(client);
  for (const [name, slug, hero] of [
    ["Giza Pool", "giza-pool", "pool01"],
    ["Giza Gym", "giza-gym", "gym02"],
  ] as const) {
    const facility = ok(
      await facilities.create(
        branchId,
        {
          name,
          slug,
          shortDescription: `The demo ${name.toLowerCase()}.`,
          description: description("A demo facility at the Giza branch."),
          openingHoursText: null,
          featured: true,
        },
        actor,
      ),
      `Demo ${name}`,
    );
    await withImages(facilities, facility.id, hero, []);
  }

  const pages = new PrismaPageRepository(client);
  const copy: Record<string, { title: string; summary: string }> = {
    HOME: {
      title: DEMO_BRANCH_NAME,
      summary: "Welcome to the demo Giza branch.",
    },
    ABOUT: {
      title: "About Rivana Giza",
      summary: "The story of the demo branch.",
    },
    CONTACT: {
      title: "Contact Rivana Giza",
      summary: "Write to the demo branch.",
    },
  };
  for (const { key } of REQUIRED_PAGES) {
    const page = (await pages.findAdminByKey(branchId, key))!;
    for (const section of page.sections) {
      if (section.type === "HERO") {
        ok(
          await pages.saveSection(
            branchId,
            key,
            {
              id: section.id,
              type: section.type,
              heading: section.heading,
              eyebrow: section.eyebrow,
              payload: { schemaVersion: 1, ...copy[key] },
              isVisible: true,
            },
            actor,
          ),
          `Demo ${key} hero`,
        );
      }
      if (section.type === "IMAGE_TEXT_SPLIT" && section.isVisible) {
        ok(
          await pages.replaceSectionMedia(
            branchId,
            key,
            section.id,
            [
              {
                mediaId: image("exterior"),
                role: "PRIMARY",
                sortOrder: 0,
                altOverride: null,
              },
            ],
            actor,
          ),
          `Demo ${key} photo`,
        );
      }
    }
    ok(await pages.publish(branchId, key, actor), `Demo ${key} publish`);
  }
  return { created: true, status: "ACTIVE" };
}

// M8 fixtures are create only and confined to the fictional branch. Fixed
// identities make a rerun preserve edited reservations, guests and templates.
const RESERVATION_FIXTURES = [
  {
    id: "qvmrseeddemobookingaaaaaa",
    reference: "RR-DEM00001",
    status: "CONFIRMED",
    source: "WEBSITE",
    day: "2027-03-01",
    entered: false,
  },
  {
    id: "qvmrseeddemobookingaaaaab",
    reference: "RR-DEM00002",
    status: "CONFIRMED",
    source: "WEBSITE",
    day: "2027-03-03",
    entered: true,
  },
  {
    id: "qvmrseeddemobookingaaaaac",
    reference: "RR-DEM00003",
    status: "CHECKED_IN",
    source: "STAFF",
    day: "2027-03-05",
    entered: false,
  },
  {
    id: "qvmrseeddemobookingaaaaad",
    reference: "RR-DEM00004",
    status: "CHECKED_OUT",
    source: "STAFF",
    day: "2027-03-07",
    entered: false,
  },
  {
    id: "qvmrseeddemobookingaaaaae",
    reference: "RR-DEM00005",
    status: "CANCELLED",
    source: "STAFF",
    day: "2027-03-09",
    entered: false,
  },
  {
    id: "qvmrseeddemobookingaaaaaf",
    reference: "RR-DEM00006",
    status: "NO_SHOW",
    source: "EXTERNAL",
    day: "2027-03-11",
    entered: false,
  },
] as const;

export async function seedDemoReservations(
  client: PrismaClient,
  staffId: string,
) {
  return client.$transaction(async (tx) => {
    const branch = await tx.branch.findUniqueOrThrow({
      where: { slug: DEMO_BRANCH_SLUG },
    });
    const room = await tx.room.findFirstOrThrow({
      where: { branchId: branch.id, slug: "giza-garden-room" },
    });
    const unit = await tx.physicalRoom.findFirstOrThrow({
      where: { branchId: branch.id, roomTypeId: room.id },
      orderBy: { id: "asc" },
    });
    // Resolve prerequisites before any fixture write; collisions roll back all.
    const coupon = await tx.coupon.findUniqueOrThrow({
      where: { id: "qnstbvgcfalkrmwxpzhedjua" },
    });
    const vat = await tx.commercialSettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    const guestId = "qvmrseeddemoguestaaaaaaa";
    await tx.guest.upsert({
      where: { id: guestId },
      update: {},
      create: {
        id: guestId,
        phone: "+12025550101",
        name: "Fictional demo guest",
        email: "guest1@example.test",
        phoneVerifiedAt: new Date("2026-11-01T00:00:00Z"),
      },
    });
    await tx.guest.upsert({
      where: { id: "qvmrseeddemoguestaaaaaab" },
      update: {},
      create: {
        id: "qvmrseeddemoguestaaaaaab",
        phone: "+12025550102",
        name: "Fictional blocked guest",
        blockedAt: new Date("2026-11-01T00:00:00Z"),
        blockedById: staffId,
        blockReason: "Fictional demo block",
      },
    });
    let created = 0;
    for (const [index, fixture] of RESERVATION_FIXTURES.entries()) {
      if (await tx.reservation.findUnique({ where: { id: fixture.id } }))
        continue;
      const checkIn = new Date(`${fixture.day}T00:00:00Z`);
      const checkOut = new Date(checkIn.getTime() + 86_400_000);
      const unpriced = fixture.source === "EXTERNAL";
      const accommodation = 6000;
      const discount = index === 0 ? 600 : 0;
      const taxable = accommodation - discount;
      const vatMinor = Math.floor(
        (taxable * vat.vatRateBasisPoints + 5000) / 10000,
      );
      const demoSummary = {
        status: fixture.status,
        assignedUnits: 0,
        checkIn: fixture.day,
        checkOut: checkOut.toISOString().slice(0, 10),
        units: [{ roomTypeId: room.id, adults: 2, children: 0 }],
        accommodationMinor: unpriced ? null : accommodation,
        servicesMinor: 0,
        discountMinor: discount,
        vatMinor: unpriced ? null : vatMinor,
        totalMinor: unpriced ? null : taxable + vatMinor,
      };
      await tx.reservation.create({
        data: {
          id: fixture.id,
          reference: fixture.reference,
          branchId: branch.id,
          source: fixture.source,
          status: fixture.status,
          checkIn,
          checkOut,
          guestId,
          guestName: "Fictional demo guest",
          guestEmail: "guest1@example.test",
          guestPhone: "+12025550101",
          internalNotes: "Fictional demo reservation for local review only.",
          externalReference: unpriced ? "FICTIONAL-EXT-1" : null,
          externalChannel: unpriced ? "Fictional partner" : null,
          accommodationMinor: unpriced ? null : accommodation,
          servicesMinor: 0,
          subtotalMinor: unpriced ? null : accommodation,
          discountMinor: discount,
          taxableMinor: unpriced ? null : taxable,
          vatRateBasisPoints: unpriced ? null : vat.vatRateBasisPoints,
          vatMinor: unpriced ? null : vatMinor,
          totalMinor: unpriced ? null : taxable + vatMinor,
          couponId: index === 0 ? coupon.id : null,
          couponCode: index === 0 ? "DEMO_PERCENT" : null,
          couponKind: index === 0 ? "PERCENT" : null,
          couponValue: index === 0 ? 1000 : null,
          createdById: fixture.source === "WEBSITE" ? null : staffId,
          pmsEnteredAt: fixture.entered
            ? new Date("2026-11-01T00:00:00Z")
            : null,
          pmsEnteredById: fixture.entered ? staffId : null,
          // The entered booking carries one pending change (Q-84, M8-T9).
          changeSeq: fixture.entered ? 1 : 0,
          pmsUpdatePendingSince: fixture.entered
            ? new Date("2026-11-02T00:00:00Z")
            : null,
          ...(fixture.entered
            ? {
                changes: {
                  create: {
                    id: "qvmrseeddemochangeaaaaaaaa",
                    seq: 1,
                    kind: "STAY",
                    actorType: "STAFF",
                    actorId: staffId,
                    before: demoSummary,
                    after: demoSummary,
                    oldTotalMinor: demoSummary.totalMinor,
                    newTotalMinor: demoSummary.totalMinor,
                  },
                },
              }
            : {}),
          statusChangedAt: new Date("2026-11-01T00:00:00Z"),
          rooms: {
            create: {
              id: `qvmrseeddemoroomaaaaaaa${index}`,
              roomTypeId: room.id,
              physicalRoomId:
                fixture.status === "CHECKED_IN" ||
                fixture.status === "CHECKED_OUT"
                  ? unit.id
                  : null,
              checkIn,
              checkOut,
              adults: 2,
              children: 0,
              consumesInventory:
                fixture.status === "CONFIRMED" ||
                fixture.status === "CHECKED_IN" ||
                fixture.status === "CHECKED_OUT",
              subtotalMinor: unpriced ? null : accommodation,
              nights: {
                create: {
                  night: checkIn,
                  amountMinor: unpriced ? null : accommodation,
                  rateSource: unpriced ? null : "BASE",
                },
              },
            },
          },
          ...(index === 0
            ? {
                redemption: {
                  create: { couponId: coupon.id, phone: "+12025550101" },
                },
              }
            : {}),
        },
      });
      created++;
    }
    for (const [index, kind] of ["STARTED", "COMPLETED"].entries()) {
      await tx.branchSyncCheckpoint.upsert({
        where: { id: `qvmrseeddemosyncaaaaaaa${index}` },
        update: {},
        create: {
          id: `qvmrseeddemosyncaaaaaaa${index}`,
          branchId: branch.id,
          kind: kind === "STARTED" ? "STARTED" : "COMPLETED",
          recordedById: staffId,
          recordedAt: new Date(`2026-11-01T0${index}:00:00Z`),
          note: "Fictional demo sync",
        },
      });
    }
    for (const [index, purpose] of [
      "VERIFICATION_CODE",
      "BOOKING_CONFIRMED",
    ].entries()) {
      await tx.whatsAppTemplate.upsert({
        where: { id: `qvmrseeddemotemplaaaaaa${index}` },
        update: {},
        create: {
          id: `qvmrseeddemotemplaaaaaa${index}`,
          purpose,
          language: "en",
          providerName: `fictional_demo_${purpose.toLowerCase()}`,
          category:
            purpose === "VERIFICATION_CODE" ? "AUTHENTICATION" : "UTILITY",
          // Valid for the purpose's allowlist (M8-T4); still inactive.
          variables:
            purpose === "VERIFICATION_CODE"
              ? ["code"]
              : ["guestFirstName", "reference", "checkIn", "checkOut"],
          previewText: "Fictional demo template, not approved by Meta.",
          active: false,
        },
      });
    }
    return { created };
  });
}
