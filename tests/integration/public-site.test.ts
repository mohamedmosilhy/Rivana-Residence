import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SubmitEnquiry } from "@/application/enquiries/submit-enquiry";
import { PublicSite } from "@/application/public/public-site";
import { PrismaEnquiryRepository } from "@/infrastructure/db/prisma/repositories/enquiry-repository";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaLoginThrottleStore } from "@/infrastructure/db/prisma/repositories/login-throttle-store";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";
import { PrismaSettingsRepository } from "@/infrastructure/db/prisma/repositories/settings-repository";
import { HmacFormTokens } from "@/infrastructure/email/hmac-form-tokens";

import { seedDatabase } from "../../prisma/seed-data";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import {
  createActor,
  createBranch,
  createFacility,
  createMedia,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();
const site = new PublicSite({
  settings: new PrismaSettingsRepository(client),
  media: new PrismaMediaRepository(client),
  pages: new PrismaPageRepository(client),
  rooms: new PrismaRoomRepository(client),
  branches: new PrismaBranchRepository(client),
  facilities: new PrismaFacilityRepository(client),
});
const now = new Date("2026-09-25T12:00:00Z");

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await seedDatabase(client);
});

describe("public queries", () => {
  it("return only published rooms and facilities, with only public images", async () => {
    const confirmed = await createMedia(client);
    const unconfirmed = await createMedia(client, {
      rightsStatus: "UNCONFIRMED",
    });
    const live = await createRoom(client, {
      status: "PUBLISHED",
      heroMediaId: confirmed.id,
      slug: "live",
    });
    await client.roomMedia.create({
      data: {
        roomId: live.id,
        mediaId: unconfirmed.id,
        role: "GALLERY",
        sortOrder: 0,
      },
    });
    await createRoom(client, { status: "DRAFT", slug: "draft" });
    await createRoom(client, { status: "ARCHIVED", slug: "archived" });
    await createFacility(client, {
      status: "PUBLISHED",
      heroMediaId: confirmed.id,
    });
    await createFacility(client, { status: "DRAFT" });

    const rooms = await site.rooms(TEST_BRANCH_ID);
    expect(rooms.map((room) => room.slug)).toEqual(["live"]);
    expect(rooms[0]?.hero).toMatchObject({
      src: `/media/${confirmed.storageKey}`,
      alt: "Bedroom with river view",
    });
    expect(rooms[0]?.gallery).toEqual([]);
    expect(await site.room(TEST_BRANCH_ID, "draft")).toBeNull();
    expect(await site.room(TEST_BRANCH_ID, "archived")).toBeNull();
    expect(await site.room(TEST_BRANCH_ID, "live")).toMatchObject({
      name: live.name,
    });
    expect(await site.facilities(TEST_BRANCH_ID)).toHaveLength(1);
    // Everything crosses the cache as JSON.
    expect(JSON.parse(JSON.stringify(rooms))).toEqual(rooms);
  });

  it("return a page only when published, with visible sections only", async () => {
    expect(await site.page(TEST_BRANCH_ID, "CONTACT")).toBeNull();
    await client.page.update({
      where: { branchId_key: { branchId: TEST_BRANCH_ID, key: "CONTACT" } },
      data: { isPublished: true },
    });

    const page = await site.page(TEST_BRANCH_ID, "CONTACT");
    expect(page?.sections.map((section) => section.type)).toEqual([
      "HERO",
      "CONTACT_CTA",
    ]);
  });

  it("return settings with only public details and ready images", async () => {
    const logo = await createMedia(client, { altText: "Rivana Residence" });
    await client.siteSettings.update({
      where: { id: "default" },
      data: {
        // A retired column (M5): never shown publicly any more.
        phone: "+20 2 1234 5678",
        logoMediaId: logo.id,
        socialLinks: {
          create: [
            {
              id: "s1",
              platform: "instagram",
              label: "Instagram",
              url: "https://instagram.com/r",
              sortOrder: 0,
              isVisible: true,
            },
            {
              id: "s2",
              platform: "x",
              label: "X",
              url: "https://x.com/r",
              sortOrder: 1,
              isVisible: false,
            },
          ],
        },
      },
    });
    const settings = await site.settings();
    expect(settings).not.toHaveProperty("phone");
    expect(settings).toMatchObject({
      siteName: "Rivana Residence",
      socialLinks: [
        {
          platform: "instagram",
          label: "Instagram",
          url: "https://instagram.com/r",
        },
      ],
      logo: { alt: "Rivana Residence" },
    });
  });
});

// T-SITE-1, T-SITE-2 (AC-4): a branch's content never appears under another
// branch, and an inactive branch is invisible.
describe("branch isolation", () => {
  const GIZA = "branch-giza-0000000000000000";

  beforeEach(async () => {
    await createBranch(client, {
      id: GIZA,
      slug: "demo-giza",
      name: "Giza",
      sortOrder: 1,
    });
    const hero = await createMedia(client);
    await createRoom(client, {
      status: "PUBLISHED",
      slug: "cairo-room",
      heroMediaId: hero.id,
    });
    await createRoom(client, {
      status: "PUBLISHED",
      slug: "giza-apartment",
      branchId: GIZA,
      heroMediaId: hero.id,
    });
    await client.room.update({
      where: { slug: "giza-apartment" },
      data: { accommodationType: "APARTMENT", bedroomCount: 2 },
    });
    await createFacility(client, {
      status: "PUBLISHED",
      slug: "giza-pool",
      branchId: GIZA,
      heroMediaId: hero.id,
    });
  });

  it("lists and finds each branch's own listings only", async () => {
    expect((await site.rooms(TEST_BRANCH_ID)).map((room) => room.slug)).toEqual(
      ["cairo-room"],
    );
    expect((await site.rooms(GIZA)).map((room) => room.slug)).toEqual([
      "giza-apartment",
    ]);
    expect(await site.room(TEST_BRANCH_ID, "giza-apartment")).toBeNull();
    expect(await site.room(GIZA, "cairo-room")).toBeNull();
    expect(await site.facility(TEST_BRANCH_ID, "giza-pool")).toBeNull();
    expect(await site.facilities(TEST_BRANCH_ID)).toEqual([]);
  });

  it("exposes the accommodation type and counts", async () => {
    expect(await site.room(GIZA, "giza-apartment")).toMatchObject({
      accommodationType: "APARTMENT",
      facts: { bedroomCount: 2, bathroomCount: null },
    });
  });

  it("lists active branches in order with their published flags", async () => {
    expect(
      (await site.activeBranches()).map((branch) => [
        branch.slug,
        branch.stayTypes,
        branch.hasFacilities,
      ]),
    ).toEqual([
      ["new-cairo", ["ROOM"], false],
      ["demo-giza", ["APARTMENT"], true],
    ]);
  });

  it("hides an inactive branch", async () => {
    await client.branch.update({
      where: { id: GIZA },
      data: { status: "INACTIVE" },
    });
    expect(await site.branch("demo-giza")).toBeNull();
    expect((await site.activeBranches()).map((branch) => branch.slug)).toEqual([
      "new-cairo",
    ]);
    expect(await site.branch("new-cairo")).toMatchObject({ slug: "new-cairo" });
  });

  it("re-checks the map URL before it reaches a page", async () => {
    await client.branch.update({
      where: { id: GIZA },
      data: { mapEmbedUrl: "https://evil.example/maps/embed" },
    });
    expect((await site.branch("demo-giza"))?.mapEmbedUrl).toBeNull();
  });
});

describe("enquiry submission", () => {
  const tokens = new HmacFormTokens("integration");
  const issued = tokens.issue(new Date(now.getTime() - 60_000));
  const values = {
    formToken: issued,
    branch: "new-cairo",
    name: "Layla Hassan",
    email: "layla@example.test",
    subject: "Long stay",
    message: "Do you have a room for March?",
  };

  function submit(
    delivery: { deliver: () => Promise<{ messageId: string }> } | null,
  ) {
    return new SubmitEnquiry({
      enquiries: new PrismaEnquiryRepository(client),
      branches: new PrismaBranchRepository(client),
      throttle: new PrismaLoginThrottleStore(client),
      tokens,
      delivery,
      clock: { now: () => now },
    });
  }

  it("persists and records delivery", async () => {
    const deliver = vi.fn(async () => ({ messageId: "<abc@mail>" }));
    expect(
      (
        await submit({ deliver }).execute({
          values,
          clientAddress: "203.0.113.9",
        })
      ).ok,
    ).toBe(true);
    // AC-14: the enquiry records the branch of the page that sent it.
    expect(await client.contactEnquiry.findFirst()).toMatchObject({
      branchId: TEST_BRANCH_ID,
      name: "Layla Hassan",
      subject: "Long stay",
      status: "NEW",
      deliveryMessageId: "<abc@mail>",
    });
  });

  it("marks a failed delivery without losing the message", async () => {
    await submit({
      deliver: async () => {
        throw new Error("SMTP down");
      },
    }).execute({ values, clientAddress: null });
    expect(await client.contactEnquiry.findFirst()).toMatchObject({
      status: "DELIVERY_FAILED",
    });
  });

  it("limits a client to five messages in ten minutes, keyed without the raw address", async () => {
    const useCase = submit(null);
    for (let index = 0; index < 5; index += 1) {
      expect(
        (await useCase.execute({ values, clientAddress: "203.0.113.9" })).ok,
      ).toBe(true);
    }
    expect(
      await useCase.execute({ values, clientAddress: "203.0.113.9" }),
    ).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
    expect(
      (await useCase.execute({ values, clientAddress: "198.51.100.7" })).ok,
    ).toBe(true);
    expect(await client.contactEnquiry.count()).toBe(6);
    const keys = await client.loginThrottle.findMany({ select: { key: true } });
    expect(
      keys.every(({ key }) => key.startsWith("e:") && !key.includes("203")),
    ).toBe(true);
  });
});
