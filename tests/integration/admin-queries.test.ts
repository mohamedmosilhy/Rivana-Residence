import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaAdminOverviewReader } from "@/infrastructure/db/prisma/repositories/admin-overview-reader";
import { PrismaEnquiryRepository } from "@/infrastructure/db/prisma/repositories/enquiry-repository";

import {
  createActor,
  createFacility,
  createMedia,
  createRoom,
  createTestClient,
  resetDatabase,
} from "./support/database";

const client = createTestClient();
const enquiries = new PrismaEnquiryRepository(client);
const overview = new PrismaAdminOverviewReader(client);
const now = new Date("2026-09-25T12:00:00Z");
const hours = (offset: number) =>
  new Date(now.getTime() + offset * 60 * 60 * 1000);

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
});

async function enquiry(
  index: number,
  overrides: Partial<{
    name: string;
    subject: string;
    status: "NEW" | "READ";
  }> = {},
) {
  return client.contactEnquiry.create({
    data: {
      id: `enquiry-${String(index).padStart(3, "0")}`,
      name: overrides.name ?? `Guest ${index}`,
      email: `guest${index}@example.test`,
      subject: overrides.subject ?? `Question ${index}`,
      message: "Is the pool heated?",
      status: overrides.status ?? "NEW",
      createdAt: hours(-index),
    },
  });
}

async function promotion(
  id: string,
  overrides: Partial<{
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    startsAt: Date | null;
    endsAt: Date | null;
    priority: number;
    showAsPopup: boolean;
  }> = {},
) {
  return client.promotion.create({
    data: {
      id,
      internalName: `Campaign ${id}`,
      headline: `Headline ${id}`,
      body: "Stay longer.",
      code: id.toUpperCase(),
      status: overrides.status ?? "PUBLISHED",
      startsAt: overrides.startsAt ?? null,
      endsAt: overrides.endsAt ?? null,
      priority: overrides.priority ?? 0,
      showAsPopup: overrides.showAsPopup ?? true,
      publishedAt: overrides.status === "DRAFT" ? null : hours(-48),
    },
  });
}

describe("enquiry listing", () => {
  it("pages newest first with an exact total", async () => {
    for (let index = 1; index <= 25; index += 1) await enquiry(index);

    const second = await enquiries.listAdminPage({
      status: null,
      search: null,
      page: 2,
      pageSize: 20,
    });

    expect(second.total).toBe(25);
    expect(second.items.map((item) => item.id)).toEqual([
      "enquiry-021",
      "enquiry-022",
      "enquiry-023",
      "enquiry-024",
      "enquiry-025",
    ]);
  });

  it("filters by status and searches name, email, and subject case-insensitively", async () => {
    await enquiry(1, { name: "Layla Hassan" });
    await enquiry(2, { subject: "Airport TRANSFER", status: "READ" });
    await enquiry(3);

    const search = (text: string, status: "NEW" | "READ" | null = null) =>
      enquiries.listAdminPage({ status, search: text, page: 1, pageSize: 20 });

    expect((await search("layla")).items.map((item) => item.id)).toEqual([
      "enquiry-001",
    ]);
    expect((await search("transfer")).total).toBe(1);
    expect((await search("transfer", "NEW")).total).toBe(0);
    expect((await search("GUEST3@EXAMPLE")).items[0]?.id).toBe("enquiry-003");
    // LIKE wildcards are matched literally.
    expect((await search("%")).total).toBe(0);
    expect((await search("_")).total).toBe(0);
    await enquiry(4, { subject: "50% off_season \\ rates" });
    expect((await search("50%")).total).toBe(1);
    expect((await search("off_season \\")).total).toBe(1);
  });

  it("returns an empty page past the end", async () => {
    await enquiry(1);
    const page = await enquiries.listAdminPage({
      status: null,
      search: null,
      page: 5,
      pageSize: 20,
    });
    expect(page).toMatchObject({ items: [], total: 1, page: 5 });
  });
});

describe("admin overview", () => {
  it("counts content by state from real records", async () => {
    await client.siteSettings.create({
      data: { id: "default", siteName: "Rivana", timeZone: "Africa/Cairo" },
    });
    await client.page.create({
      data: {
        id: "page-home",
        key: "HOME",
        title: "Home",
        canonicalPath: "/",
        isPublished: true,
      },
    });
    await client.page.create({
      data: {
        id: "page-about",
        key: "ABOUT",
        title: "About",
        canonicalPath: "/about",
      },
    });
    await createRoom(client, { status: "PUBLISHED" });
    await createRoom(client);
    await createRoom(client, { status: "ARCHIVED" });
    await createFacility(client, { status: "PUBLISHED" });
    await createMedia(client);
    await createMedia(client, { altText: "" });
    await createMedia(client, { status: "FAILED" });
    await enquiry(1);
    await enquiry(2, { status: "READ" });

    const result = await overview.read(now, 6);

    expect(result).toMatchObject({
      timeZone: "Africa/Cairo",
      pages: { published: 1, total: 2 },
      rooms: { PUBLISHED: 1, DRAFT: 1, ARCHIVED: 1 },
      facilities: { PUBLISHED: 1, DRAFT: 0, ARCHIVED: 0 },
      media: { ready: 2, missingAltText: 1, failed: 1 },
      enquiries: { new: 1, deliveryFailed: 0 },
    });
    expect(result.recent).toHaveLength(6);
    const times = result.recent.map((item) => item.updatedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("reports the promotion the public site shows and the next scheduled one", async () => {
    await promotion("low", { priority: 1 });
    await promotion("high", { priority: 5, endsAt: hours(24) });
    await promotion("draft", { status: "DRAFT", priority: 99 });
    await promotion("expired", { priority: 99, endsAt: hours(-1) });
    await promotion("hidden", { priority: 99, showAsPopup: false });
    await promotion("later", { startsAt: hours(48) });
    await promotion("soon", { startsAt: hours(2) });

    const { promotions } = await overview.read(now, 6);

    expect(promotions.active).toMatchObject({ id: "high", endsAt: hours(24) });
    expect(promotions.scheduledCount).toBe(2);
    expect(promotions.nextScheduled).toMatchObject({
      id: "soon",
      startsAt: hours(2),
    });
  });

  it("works on an empty database", async () => {
    const result = await overview.read(now, 6);
    expect(result).toMatchObject({
      timeZone: "Africa/Cairo",
      pages: { published: 0, total: 0 },
      promotions: { active: null, scheduledCount: 0, nextScheduled: null },
      recent: [],
    });
  });
});
