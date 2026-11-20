import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "../support/database";
import {
  bookingBody,
  configureWhatsApp,
  issueToken,
  NOW,
  phoneOf,
  seedBookable,
} from "./support/website-booking";

// covers: the production wiring in src/composition/reservations.ts, not a test copy.
vi.stubEnv("WHATSAPP_PROVIDER", "fake");
const { createWebsiteReservation } = await import("@/composition/reservations");

const client = createTestClient();
const clock = { now: () => NOW };
const phone = phoneOf(1);

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

describe("createWebsiteReservation (composition)", () => {
  it("books through the real wiring and queues messages from the real writer", async () => {
    await seedBookable(client);
    await configureWhatsApp(client);
    const token = await issueToken(client, phone);
    const result = await createWebsiteReservation({ client, clock }).execute(
      bookingBody(phone, token),
      "composition-key-0001",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const outbox = await client.notificationOutbox.findMany();
    expect(outbox).toHaveLength(3);
    const link = outbox
      .map((message) => (message.payload as { manageLink?: string }).manageLink)
      .find(Boolean);
    expect(link).toContain("/reservations/manage#t=");
  });

  it("is branch not bookable until WhatsApp is configured", async () => {
    await seedBookable(client);
    const token = await issueToken(client, phone);
    const result = await createWebsiteReservation({ client, clock }).execute(
      bookingBody(phone, token),
      "composition-key-0002",
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "BRANCH_NOT_BOOKABLE" },
    });
    expect(await client.reservation.count()).toBe(0);
  });

  it("counts the verified phone's coupon redemptions (phone aware wiring)", async () => {
    await seedBookable(client, { units: 2 });
    await configureWhatsApp(client);
    await client.coupon.create({
      data: {
        id: "coupon-1",
        code: "WELCOME",
        kind: "PERCENT",
        percentBasisPoints: 1000,
        maxRedemptionsPerPhone: 1,
        allBranches: true,
      },
    });
    const booking = createWebsiteReservation({ client, clock });
    const body = (token: string, checkIn: string, checkOut: string) =>
      bookingBody(phone, token, {
        stay: { checkIn, checkOut },
        couponCode: "WELCOME",
        expectedTotal: { amountMinor: 31_050, currency: "USD" },
      });
    expect(
      (
        await booking.execute(
          body(await issueToken(client, phone), "2031-04-10", "2031-04-13"),
          "composition-key-0003",
        )
      ).ok,
    ).toBe(true);
    const second = await booking.execute(
      body(await issueToken(client, phone), "2031-05-10", "2031-05-13"),
      "composition-key-0004",
    );
    expect(second).toMatchObject({
      ok: false,
      error: { code: "COUPON_INVALID" },
    });
  });
});
