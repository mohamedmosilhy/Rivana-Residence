import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaEnquiryRepository } from "@/infrastructure/db/prisma/repositories/enquiry-repository";
import { PrismaPromotionRepository } from "@/infrastructure/db/prisma/repositories/promotion-repository";

import {
  actor,
  createActor,
  createTestClient,
  resetDatabase,
} from "./support/database";

const client = createTestClient();
const promotions = new PrismaPromotionRepository(client);
const enquiries = new PrismaEnquiryRepository(client);
const now = new Date("2026-10-01T12:00:00Z");
const hour = 60 * 60 * 1000;

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
});

function createPromotion(
  id: string,
  data: Partial<{
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    startsAt: Date | null;
    endsAt: Date | null;
    priority: number;
    showAsPopup: boolean;
    publishedAt: Date | null;
  }> = {},
) {
  return client.promotion.create({
    data: {
      id,
      internalName: id,
      headline: `Headline ${id}`,
      body: "Stay three nights by the river.",
      code: id.toUpperCase(),
      status: "PUBLISHED",
      publishedAt: new Date(now.getTime() - hour),
      ...data,
    },
  });
}

describe("promotion repository", () => {
  it("never returns inactive promotions publicly", async () => {
    await createPromotion("draft", { status: "DRAFT" });
    await createPromotion("archived", { status: "ARCHIVED" });
    await createPromotion("future", {
      startsAt: new Date(now.getTime() + hour),
    });
    await createPromotion("expired", { endsAt: now });
    await createPromotion("hidden", { showAsPopup: false });

    expect(await promotions.getCurrent(now)).toBeNull();
  });

  it("selects by priority, then most recent publication", async () => {
    await createPromotion("low", { priority: 1 });
    await createPromotion("older", {
      priority: 5,
      publishedAt: new Date(now.getTime() - 3 * hour),
    });
    await createPromotion("newer", {
      priority: 5,
      startsAt: now,
      endsAt: new Date(now.getTime() + hour),
    });

    expect((await promotions.getCurrent(now))?.id).toBe("newer");
  });

  it("publishes valid drafts with a publication timestamp", async () => {
    await createPromotion("spring", { status: "DRAFT", publishedAt: null });

    expect(await promotions.publish("spring", actor, now)).toMatchObject({
      ok: true,
      value: { status: "PUBLISHED", publishedAt: now },
    });
    expect((await promotions.getCurrent(now))?.id).toBe("spring");

    expect((await promotions.archive("spring", actor)).ok).toBe(true);
    expect(await promotions.getCurrent(now)).toBeNull();
  });
});

describe("enquiry repository", () => {
  it("stores valid enquiries and lists them for admins", async () => {
    const created = await enquiries.create({
      name: "Amira",
      email: "amira@example.test",
      phone: null,
      subject: "Family stay",
      message: "Do you have connecting rooms?",
    });

    expect(created).toMatchObject({ ok: true, value: { status: "NEW" } });
    expect(await enquiries.listAdmin("NEW")).toHaveLength(1);
    expect(await enquiries.listAdmin("ARCHIVED")).toHaveLength(0);
  });

  it("rejects markup and archives enquiries", async () => {
    expect(
      await enquiries.create({
        name: "<script>",
        email: "x@example.test",
        phone: null,
        subject: null,
        message: "hi",
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });

    const created = await enquiries.create({
      name: "Omar",
      email: "omar@example.test",
      phone: null,
      subject: null,
      message: "Hello",
    });
    if (!created.ok) throw new Error("Expected enquiry to be created");

    expect((await enquiries.archive(created.value.id, actor, now)).ok).toBe(
      true,
    );
    expect(await enquiries.listAdmin("ARCHIVED")).toHaveLength(1);
    expect(await enquiries.archive("missing", actor, now)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
