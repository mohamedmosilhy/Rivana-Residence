import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SubmitEnquiry } from "@/application/enquiries/submit-enquiry";
import { PublicSite, activePromotion } from "@/application/public/public-site";
import { PrismaEnquiryRepository } from "@/infrastructure/db/prisma/repositories/enquiry-repository";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaLoginThrottleStore } from "@/infrastructure/db/prisma/repositories/login-throttle-store";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaPromotionRepository } from "@/infrastructure/db/prisma/repositories/promotion-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";
import { PrismaSettingsRepository } from "@/infrastructure/db/prisma/repositories/settings-repository";
import { HmacFormTokens } from "@/infrastructure/email/hmac-form-tokens";

import { seedDatabase } from "../../prisma/seed-data";
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
const site = new PublicSite({
  settings: new PrismaSettingsRepository(client),
  media: new PrismaMediaRepository(client),
  pages: new PrismaPageRepository(client),
  rooms: new PrismaRoomRepository(client),
  facilities: new PrismaFacilityRepository(client),
  promotions: new PrismaPromotionRepository(client),
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

    const rooms = await site.rooms();
    expect(rooms.map((room) => room.slug)).toEqual(["live"]);
    expect(rooms[0]?.hero).toMatchObject({
      src: `/media/${confirmed.storageKey}`,
      alt: "Bedroom with river view",
    });
    expect(rooms[0]?.gallery).toEqual([]);
    expect(await site.room("draft")).toBeNull();
    expect(await site.room("archived")).toBeNull();
    expect(await site.room("live")).toMatchObject({ name: live.name });
    expect(await site.facilities()).toHaveLength(1);
    // Everything crosses the cache as JSON.
    expect(JSON.parse(JSON.stringify(rooms))).toEqual(rooms);
  });

  it("return a page only when published, with visible sections only", async () => {
    expect(await site.page("CONTACT")).toBeNull();
    await client.page.update({
      where: { key: "CONTACT" },
      data: { isPublished: true },
    });

    const page = await site.page("CONTACT");
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
        city: "New Cairo",
        country: "Egypt",
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
    expect(await site.settings()).toMatchObject({
      siteName: "Rivana Residence",
      addressLines: ["New Cairo, Egypt"],
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

  it("offer only live pop-up campaigns and pick the winner by the public rule", async () => {
    const promotions = new PrismaPromotionRepository(client);
    const create = async (code: string, extra: Record<string, unknown>) => {
      const created = await promotions.create(
        {
          internalName: code,
          headline: code,
          body: "Body",
          code,
          terms: null,
          startsAt: null,
          endsAt: null,
          priority: 0,
          showAsPopup: true,
          ...extra,
        },
        actor,
      );
      if (!created.ok) throw new Error(created.error.message);
      return created.value;
    };
    const low = await create("LOW", { priority: 1 });
    const high = await create("HIGH", { priority: 9 });
    const ended = await create("ENDED", {
      priority: 50,
      endsAt: new Date("2026-01-01T00:00:00Z"),
      startsAt: new Date("2025-01-01T00:00:00Z"),
    });
    const hidden = await create("HIDDEN", { priority: 60, showAsPopup: false });
    await create("DRAFT", { priority: 70 });
    for (const item of [low, high, ended, hidden])
      await promotions.publish(item.id, actor, now);

    const candidates = await site.promotionCandidates(now);
    expect(candidates.map((candidate) => candidate.code).sort()).toEqual([
      "HIGH",
      "LOW",
    ]);
    expect(activePromotion(candidates, now)?.code).toBe("HIGH");
  });
});

describe("enquiry submission", () => {
  const tokens = new HmacFormTokens("integration");
  const issued = tokens.issue(new Date(now.getTime() - 60_000));
  const values = {
    formToken: issued,
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
    expect(await client.contactEnquiry.findFirst()).toMatchObject({
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
