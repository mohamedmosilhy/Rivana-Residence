import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { AuditLog } from "@/application/audit";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaCouponRedemptionReader } from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-redemption-repository";

import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { deferred, withIndependentClients } from "./support/concurrency";
import {
  bookingBody,
  issueToken,
  MARKETING,
  pausedAudit,
  phoneOf,
  rowCounts,
  seedBookable,
  seedBranch,
  TOTAL_MINOR,
  waitForLockWaiters,
  websiteBooking,
} from "./support/website-booking";

// covers: AC-1 to AC-4, T-RES-1…12, T-NTF-3, C-1, C-2, C-9, C-11 (use case level, no HTTP)
const client = createTestClient();
const phone = phoneOf(1);
const ROUNDS = 20;
const key = (label: string) => `key-${label}-0123456789`;

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

async function coupon(
  maxRedemptions: number | null,
  percent = 1000,
  perPhone: number | null = null,
) {
  await client.coupon.create({
    data: {
      id: "coupon-1",
      code: "WELCOME",
      kind: "PERCENT",
      percentBasisPoints: percent,
      maxRedemptions,
      maxRedemptionsPerPhone: perPhone,
      allBranches: true,
    },
  });
}

const book = (
  overrides: Record<string, unknown> = {},
  idempotencyKey = key("a"),
  who = phone,
  tokenOf?: string,
  connection: PrismaClient = client,
) =>
  (async () => {
    const token = tokenOf ?? (await issueToken(client, who));
    return websiteBooking(connection).execute(
      bookingBody(who, token, overrides),
      idempotencyKey,
    );
  })();

function expectFailure(
  result: Awaited<ReturnType<typeof book>>,
  code: string,
  context?: Record<string, unknown>,
) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
    if (context) expect(result.error.context).toEqual(context);
  }
}

const nothingWritten = async (consumedBefore = 0) =>
  expect(await rowCounts(client)).toEqual({
    reservations: 0,
    redemptions: 0,
    audits: 0,
    outbox: 0,
    consumed: consumedBefore,
  });

describe("CreateWebsiteReservation", () => {
  it("confirms a booking, takes inventory, and writes everything in one transaction", async () => {
    await seedBookable(client);
    const result = await book({
      marketingOptIn: { consentVersion: MARKETING },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: "CONFIRMED",
      totalMinor: TOTAL_MINOR,
      replayed: false,
    });
    expect(result.value.reference).toMatch(/^RR-[0-9A-Z]{8}$/);
    expect(result.value.manageToken).toHaveLength(43);

    const row = await client.reservation.findUniqueOrThrow({
      where: { id: result.value.reservationId },
      include: { rooms: { include: { nights: true } }, guest: true },
    });
    expect(row).toMatchObject({
      status: "CONFIRMED",
      source: "WEBSITE",
      paymentMethod: "PAY_AT_HOTEL",
      paymentStatus: "NOT_REQUIRED",
      totalMinor: TOTAL_MINOR,
      vatMinor: 4500,
      privacyNoticeVersion: "privacy-placeholder-v1",
    });
    expect(row.rooms).toHaveLength(1);
    expect(row.rooms[0]).toMatchObject({ consumesInventory: true });
    expect(row.rooms[0]!.nights).toHaveLength(3);
    // The manage token is stored as a hash only, expiring 30 days after check out.
    expect(row.manageTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.manageTokenHash).not.toContain(result.value.manageToken!);
    expect(row.manageTokenExpiresAt?.toISOString()).toBe(
      "2031-05-13T00:00:00.000Z",
    );
    expect(row.guest).toMatchObject({
      phone,
      marketingConsentVersion: MARKETING,
    });
    expect(row.guest!.phoneVerifiedAt).not.toBeNull();
    expect(row.guest!.marketingOptInAt).not.toBeNull();

    const outbox = await client.notificationOutbox.findMany({
      orderBy: { channel: "asc" },
    });
    expect(
      outbox.map((message) => [message.channel, message.kind, message.status]),
    ).toEqual(
      expect.arrayContaining([
        ["EMAIL", "reservation.confirmed", "PENDING"],
        ["EMAIL", "reservation.staff-alert", "PENDING"],
        ["WHATSAPP", "reservation.confirmed", "PENDING"],
      ]),
    );
    expect(outbox).toHaveLength(3);
    const audit = await client.auditEvent.findMany({
      where: { action: "reservation.created" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: "GUEST",
      entityType: "Reservation",
      entityId: result.value.reservationId,
    });
    // No personal value reaches the audit log.
    expect(JSON.stringify(audit[0]!.changes)).not.toMatch(
      /Amina|amina@|\+1202|token/i,
    );
    expect(
      await client.phoneVerification.count({
        where: { consumedAt: { not: null } },
      }),
    ).toBe(1);
  });

  it("refuses a changed price with the new quote and writes nothing", async () => {
    await seedBookable(client);
    const result = await book({
      expectedTotal: { amountMinor: TOTAL_MINOR - 1, currency: "USD" },
    });
    expectFailure(result, "PRICE_CHANGED");
    if (!result.ok && result.error.code === "PRICE_CHANGED")
      expect(result.error.context.quote.totalMinor).toBe(TOTAL_MINOR);
    await nothingWritten();
  });

  it("refuses unavailable inventory and a two unit booking with one unit free (C-2)", async () => {
    await seedBookable(client, { units: 1 });
    const two = [
      { roomSlug: "garden", occupancy: { adults: 2, children: 0 } },
      { roomSlug: "garden", occupancy: { adults: 1, children: 0 } },
    ];
    const result = await book({ lines: two });
    expectFailure(result, "INVENTORY_UNAVAILABLE");
    if (!result.ok && result.error.code === "INVENTORY_UNAVAILABLE")
      expect(result.error.context.firstUnavailableNight).toBe("2031-04-10");
    await nothingWritten();
  });

  it.each([
    [
      "an unknown listing",
      { lines: [{ roomSlug: "nope", occupancy: { adults: 1, children: 0 } }] },
      "VALIDATION",
    ],
    ["a client price", { totalMinor: 1 }, "VALIDATION"],
    [
      "a card payment",
      { paymentMethod: "ONLINE" },
      "PAYMENT_METHOD_UNAVAILABLE",
    ],
    [
      "an old privacy version",
      { consent: { privacyNoticeVersion: "old" } },
      "VALIDATION",
    ],
    [
      "more guests than the listing sleeps",
      {
        lines: [{ roomSlug: "garden", occupancy: { adults: 9, children: 0 } }],
      },
      "VALIDATION",
    ],
  ])("refuses %s and writes nothing", async (_label, overrides, code) => {
    await seedBookable(client);
    expectFailure(await book(overrides), code);
    await nothingWritten();
  });

  it("refuses a branch that does not take online bookings, or has no verification channel", async () => {
    await seedBookable(client);
    const token = await issueToken(client, phone);
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { onlineBookingEnabled: false },
    });
    expectFailure(
      await book({}, key("a"), phone, token),
      "BRANCH_NOT_BOOKABLE",
      { reason: "ONLINE_BOOKING_DISABLED" },
    );
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { onlineBookingEnabled: true, checkInTime: null },
    });
    expectFailure(
      await book({}, key("a"), phone, token),
      "BRANCH_NOT_BOOKABLE",
      { reason: "CHECK_IN_TIME_MISSING" },
    );
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { checkInTime: "14:00" },
    });
    // T-VCH-8: neither WhatsApp nor email ready (ADR 031).
    const unconfigured = await websiteBooking(client, {
      setupConfigured: false,
      emailReady: false,
    }).execute(bookingBody(phone, token), key("a"));
    expectFailure(unconfigured, "BRANCH_NOT_BOOKABLE", {
      reason: "VERIFICATION_NOT_CONFIGURED",
    });
    expect((await rowCounts(client)).reservations).toBe(0);
    // The token was never consumed by any refusal.
    expect((await rowCounts(client)).consumed).toBe(0);
  });

  it("refuses with the same reason when booking closes between the pre check and the locked quote", async () => {
    await seedBookable(client);
    const token = await issueToken(client, phone);
    const closed = await websiteBooking(client, {
      quote: (inner) => ({
        execute: async (input) => {
          const quoted = await inner.execute(input);
          return quoted.ok
            ? { ok: true, value: { ...quoted.value, bookable: false } }
            : quoted;
        },
      }),
    }).execute(bookingBody(phone, token), key("closed"));
    expectFailure(closed, "BRANCH_NOT_BOOKABLE", {
      reason: "ONLINE_BOOKING_DISABLED",
    });
    // The transaction rolled back, so the token is still unused.
    expect(await rowCounts(client)).toMatchObject({
      reservations: 0,
      consumed: 0,
    });
  });

  describe("verification token", () => {
    it("needs a known, unexpired, unused BOOKING token for the same phone", async () => {
      await seedBookable(client);
      const run = (token: string, who = phone) =>
        websiteBooking(client).execute(bookingBody(who, token), key("t"));
      expectFailure(
        await run("unknown-token-0123456789"),
        "PHONE_NOT_VERIFIED",
      );
      expectFailure(
        await run(await issueToken(client, phone, { expired: true })),
        "PHONE_NOT_VERIFIED",
      );
      expectFailure(
        await run(
          await issueToken(client, phoneOf(2), { consumed: true }),
          phoneOf(2),
        ),
        "PHONE_NOT_VERIFIED",
      );
      expectFailure(
        await run(
          await issueToken(client, phoneOf(3), { purpose: "GUEST_SESSION" }),
          phoneOf(3),
        ),
        "PHONE_NOT_VERIFIED",
      );
      // A token proved for another phone cannot book for this one.
      expectFailure(
        await run(await issueToken(client, phoneOf(4)), phone),
        "PHONE_NOT_VERIFIED",
      );
      expect((await rowCounts(client)).reservations).toBe(0);
    });

    it("is single use", async () => {
      await seedBookable(client);
      const token = await issueToken(client, phone);
      expect((await book({}, key("a"), phone, token)).ok).toBe(true);
      expectFailure(
        await book(
          { stay: { checkIn: "2031-05-10", checkOut: "2031-05-12" } },
          key("b"),
          phone,
          token,
        ),
        "PHONE_NOT_VERIFIED",
      );
      expect((await rowCounts(client)).reservations).toBe(1);
    });

    it("refuses a blocked phone with the neutral error", async () => {
      await seedBookable(client);
      await client.guest.create({
        data: {
          id: "guest-blocked",
          phone,
          name: "Blocked",
          blockedAt: new Date("2031-01-01T00:00:00Z"),
        },
      });
      expectFailure(await book(), "PHONE_BLOCKED");
      await nothingWritten();
    });
  });

  describe("idempotency", () => {
    it("replays the same key and body without a second booking or a repeated token", async () => {
      await seedBookable(client);
      const token = await issueToken(client, phone);
      const first = await book({}, key("a"), phone, token);
      const again = await book({}, key("a"), phone, token);
      expect(first.ok && again.ok).toBe(true);
      if (!first.ok || !again.ok) return;
      expect(again.value).toMatchObject({
        replayed: true,
        reference: first.value.reference,
        manageToken: null,
      });
      expect(await rowCounts(client)).toMatchObject({
        reservations: 1,
        audits: 1,
        outbox: 3,
      });
    });

    it("refuses the same key with a different body, phone or token", async () => {
      await seedBookable(client);
      const token = await issueToken(client, phone);
      expect((await book({}, key("a"), phone, token)).ok).toBe(true);
      expectFailure(
        await book(
          { stay: { checkIn: "2031-04-10", checkOut: "2031-04-12" } },
          key("a"),
          phone,
          token,
        ),
        "IDEMPOTENCY_KEY_REUSED",
      );
      // Another client replaying the key and body without the token learns nothing.
      expectFailure(
        await book({}, key("a"), phone, "someone-elses-token-0123456789"),
        "IDEMPOTENCY_KEY_REUSED",
      );
      expect((await rowCounts(client)).reservations).toBe(1);
    });

    it("treats unit and service order as the same request", async () => {
      await seedBookable(client);
      const token = await issueToken(client, phone);
      const lines = [
        { roomSlug: "garden", occupancy: { adults: 2, children: 0 } },
        { roomSlug: "garden", occupancy: { adults: 1, children: 0 } },
      ];
      const total = { amountMinor: TOTAL_MINOR * 2, currency: "USD" };
      expect(
        (await book({ lines, expectedTotal: total }, key("a"), phone, token))
          .ok,
      ).toBe(true);
      const reversed = await book(
        { lines: [...lines].reverse(), expectedTotal: total },
        key("a"),
        phone,
        token,
      );
      expect(reversed.ok && reversed.value.replayed).toBe(true);
    });
  });

  it("caps a phone at two upcoming pay at hotel bookings across branches", async () => {
    await seedBookable(client);
    const dates = [
      ["2031-04-10", "2031-04-13"],
      ["2031-05-10", "2031-05-13"],
      ["2031-06-10", "2031-06-13"],
    ] as const;
    const results = [];
    for (const [index, [checkIn, checkOut]] of dates.entries())
      results.push(
        await book({ stay: { checkIn, checkOut } }, key(`cap-${index}`)),
      );
    expect(results[0]!.ok && results[1]!.ok).toBe(true);
    expectFailure(results[2]!, "BOOKING_LIMIT_REACHED");
    expect((await rowCounts(client)).reservations).toBe(2);
    // The refused attempt did not consume its token.
    expect((await rowCounts(client)).consumed).toBe(2);
  });

  describe("coupon", () => {
    it("redeems under the coupon lock and snapshots the discount", async () => {
      await seedBookable(client);
      await coupon(null);
      // 10% off 300.00 → 270.00 taxable, VAT 40.50.
      const result = await book({
        couponCode: "welcome",
        expectedTotal: { amountMinor: 31_050, currency: "USD" },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await client.reservation.findUniqueOrThrow({
        where: { id: result.value.reservationId },
        include: { redemption: true },
      });
      expect(row).toMatchObject({
        couponCode: "WELCOME",
        discountMinor: 3000,
        totalMinor: 31_050,
      });
      expect(row.redemption).toMatchObject({
        couponId: "coupon-1",
        phone,
        releasedAt: null,
      });
    });

    it("refuses an exhausted coupon and writes nothing", async () => {
      await seedBookable(client);
      await coupon(1);
      expect(
        (
          await book({
            couponCode: "WELCOME",
            expectedTotal: { amountMinor: 31_050, currency: "USD" },
          })
        ).ok,
      ).toBe(true);
      const second = await book(
        {
          couponCode: "WELCOME",
          expectedTotal: { amountMinor: 31_050, currency: "USD" },
        },
        key("b"),
        phoneOf(2),
      );
      expectFailure(second, "COUPON_INVALID");
      expect(await rowCounts(client)).toMatchObject({
        reservations: 1,
        redemptions: 1,
        audits: 1,
        outbox: 3,
      });
    });

    it("counts a phone's redemptions only when the caller is phone aware", async () => {
      await seedBookable(client);
      await coupon(null);
      expect(
        (
          await book({
            couponCode: "WELCOME",
            expectedTotal: { amountMinor: 31_050, currency: "USD" },
          })
        ).ok,
      ).toBe(true);
      const input = { code: "WELCOME", phone };
      expect(
        await new PrismaCouponRedemptionReader(client, {
          phoneAware: true,
        }).count(input),
      ).toEqual({ total: 1, forPhone: 1 });
      // Public quotes stay phone blind: an unverified phone never changes the answer.
      expect(
        await new PrismaCouponRedemptionReader(client, {
          phoneAware: false,
        }).count(input),
      ).toEqual({ total: 1, forPhone: 0 });
    });
  });

  it("rolls everything back when a later step fails, including the token", async () => {
    await seedBookable(client);
    const failing = (inner: AuditLog): AuditLog => ({
      append: async () => {
        void inner;
        throw new Error("audit unavailable");
      },
    });
    const token = await issueToken(client, phone);
    await expect(
      websiteBooking(client, { audit: failing }).execute(
        bookingBody(phone, token),
        key("a"),
      ),
    ).rejects.toThrow("audit unavailable");
    await nothingWritten();
    expect(await client.guest.count()).toBe(0);
    // The token is still usable afterwards.
    expect((await book({}, key("a"), phone, token)).ok).toBe(true);
  });

  describe("more refusals and edge cases", () => {
    it("never writes a guest row for a made up token", async () => {
      await seedBookable(client);
      const result = await websiteBooking(client).execute(
        bookingBody(phone, "made-up-token-0123456789"),
        key("a"),
      );
      expectFailure(result, "PHONE_NOT_VERIFIED");
      expect(await client.guest.count()).toBe(0);
    });

    it("answers a lost response retry even after the branch or listing changed", async () => {
      await seedBookable(client);
      const token = await issueToken(client, phone);
      const first = await book({}, key("a"), phone, token);
      expect(first.ok).toBe(true);
      await client.branch.update({
        where: { id: TEST_BRANCH_ID },
        data: { onlineBookingEnabled: false },
      });
      await client.room.updateMany({ data: { status: "DRAFT" } });
      const retry = await book({}, key("a"), phone, token);
      expect(retry.ok && retry.value.replayed).toBe(true);
      // A different request under that key is still refused.
      expectFailure(
        await book({ couponCode: "OTHER" }, key("a"), phone, token),
        "IDEMPOTENCY_KEY_REUSED",
      );
    });

    it("hides an inactive branch, an unpublished listing and another branch's listing", async () => {
      await seedBookable(client);
      await seedBranch(client, { id: "branch-2", slug: "alexandria" });
      await seedBookable(client, {
        slug: "villa",
        branchId: "branch-2",
        units: 1,
      });
      const villa = [
        { roomSlug: "villa", occupancy: { adults: 2, children: 0 } },
      ];
      // A listing that belongs to another branch is not found here.
      expectFailure(await book({ lines: villa }), "VALIDATION");
      await client.room.updateMany({
        where: { slug: "garden" },
        data: { status: "DRAFT" },
      });
      expectFailure(await book({}, key("b"), phoneOf(2)), "VALIDATION");
      await client.branch.update({
        where: { id: TEST_BRANCH_ID },
        data: { status: "INACTIVE" },
      });
      expectFailure(await book({}, key("c"), phoneOf(3)), "NOT_FOUND");
      await nothingWritten();
    });

    it("prices and stores a service with its details", async () => {
      await seedBookable(client);
      await client.serviceOffering.create({
        data: {
          id: "svc-transfer",
          branchId: TEST_BRANCH_ID,
          kind: "AIRPORT_TRANSFER",
          priceUnit: "PER_VEHICLE",
          priceMinor: 5000,
          maxVehicles: 3,
          active: true,
        },
      });
      // 300.00 + 50.00 = 350.00, VAT 52.50.
      const result = await book({
        services: [
          { kind: "AIRPORT_TRANSFER", vehicles: 1, details: "Flight MS123" },
        ],
        expectedTotal: { amountMinor: 40_250, currency: "USD" },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const services = await client.reservationService.findMany({
        where: { reservationId: result.value.reservationId },
      });
      expect(services).toHaveLength(1);
      expect(services[0]).toMatchObject({
        kind: "AIRPORT_TRANSFER",
        vehicles: 1,
        details: "Flight MS123",
        amountMinor: 5000,
      });
    });

    it("counts a phone's upcoming bookings across branches", async () => {
      await seedBookable(client);
      await seedBranch(client, {
        id: "branch-2",
        slug: "alexandria",
        timeZone: "Pacific/Kiritimati",
      });
      await seedBookable(client, {
        slug: "villa",
        branchId: "branch-2",
        units: 2,
      });
      const elsewhere = (checkIn: string, checkOut: string, tag: string) =>
        book(
          {
            branchSlug: "alexandria",
            lines: [
              { roomSlug: "villa", occupancy: { adults: 2, children: 0 } },
            ],
            stay: { checkIn, checkOut },
          },
          key(tag),
        );
      expect((await elsewhere("2031-04-10", "2031-04-13", "x1")).ok).toBe(true);
      expect((await elsewhere("2031-05-10", "2031-05-13", "x2")).ok).toBe(true);
      // Two bookings in another branch use up the cap for this one.
      expectFailure(await book({}, key("x3")), "BOOKING_LIMIT_REACHED");
    });

    it("enforces a per phone coupon limit across bookings", async () => {
      await seedBookable(client);
      await coupon(null, 1000, 1);
      const first = await book({
        couponCode: "WELCOME",
        expectedTotal: { amountMinor: 31_050, currency: "USD" },
      });
      expect(first.ok).toBe(true);
      const second = await book(
        {
          couponCode: "WELCOME",
          stay: { checkIn: "2031-05-10", checkOut: "2031-05-13" },
          expectedTotal: { amountMinor: 31_050, currency: "USD" },
        },
        key("b"),
      );
      expectFailure(second, "COUPON_INVALID");
      if (!second.ok && second.error.code === "COUPON_INVALID")
        expect(second.error.context.reason).toBe("PHONE_LIMIT_REACHED");
      // Another phone is not limited by this phone's redemption.
      const other = await book(
        {
          couponCode: "WELCOME",
          expectedTotal: { amountMinor: 31_050, currency: "USD" },
        },
        key("c"),
        phoneOf(2),
      );
      expect(other.ok).toBe(true);
      expect((await rowCounts(client)).redemptions).toBe(2);
    });

    it("takes the coupon row lock, after the listing lock", async () => {
      await seedBookable(client);
      await coupon(null);
      const token = await issueToken(client, phone);
      const holding = deferred();
      const release = deferred();
      const blocker = client.$transaction(
        async (tx) => {
          // NO KEY UPDATE conflicts with the booking's FOR UPDATE but not with
          // the foreign key check of the redemption insert, so a wait here
          // proves the explicit coupon lock and not a side effect.
          await tx.$queryRaw`SELECT id FROM "Coupon" WHERE id = 'coupon-1' FOR NO KEY UPDATE`;
          holding.resolve();
          await release.promise;
        },
        { timeout: 30_000 },
      );
      await holding.promise;
      const booking = await withIndependentClients(1, async ([other]) => {
        const pending = websiteBooking(other!).execute(
          bookingBody(phone, token, {
            couponCode: "WELCOME",
            expectedTotal: { amountMinor: 31_050, currency: "USD" },
          }),
          key("a"),
        );
        // The booking can only be waiting on the coupon row we hold.
        await waitForLockWaiters(client, 1);
        release.resolve();
        await blocker;
        return pending;
      });
      expect(booking.ok).toBe(true);
    });
  });

  // T-VCH-3, 4, 5, 7, 8 (ADR 031, spec 0006 Decision 9).
  describe("email verified bookings", () => {
    const email = "amina@example.test";
    const emailToken = (who = phone, address = email) =>
      issueToken(client, who, { email: address });
    const bookByEmail = async (
      overrides: Record<string, unknown> = {},
      idempotencyKey = key("email"),
      who = phone,
      options: Parameters<typeof websiteBooking>[1] = {},
    ) =>
      websiteBooking(client, options).execute(
        bookingBody(who, await emailToken(who), overrides),
        idempotencyKey,
      );

    it("books with an email token, records the channel, and never verifies the phone", async () => {
      await seedBookable(client);
      const result = await bookByEmail({
        marketingOptIn: { consentVersion: MARKETING },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await client.reservation.findUniqueOrThrow({
        where: { id: result.value.reservationId },
        include: { guest: true },
      });
      expect(row).toMatchObject({
        verificationChannel: "EMAIL",
        verifiedEmail: email,
        guestEmail: email,
        guestPhone: phone,
      });
      expect(row.guest).toMatchObject({
        phone,
        email,
        phoneVerifiedAt: null,
        // An email booking never records marketing consent for the phone.
        marketingOptInAt: null,
        marketingConsentVersion: null,
      });
      expect(row.guest!.emailVerifiedAt).not.toBeNull();
      // Guest messages go by email only: nothing to the unproven phone.
      const outbox = await client.notificationOutbox.findMany();
      expect(
        outbox.map((message) => [message.channel, message.kind]).sort(),
      ).toEqual([
        ["EMAIL", "reservation.confirmed"],
        ["EMAIL", "reservation.staff-alert"],
      ]);
      expect(
        outbox.find((m) => m.kind === "reservation.confirmed")?.recipient,
      ).toBe(email);
    });

    it("needs the booking email to equal the verified email", async () => {
      await seedBookable(client);
      const token = await emailToken(phone, "other@example.test");
      const result = await websiteBooking(client).execute(
        bookingBody(phone, token),
        key("mismatch"),
      );
      expectFailure(result, "PHONE_NOT_VERIFIED");
      // Case is normalized before comparing, so a capitalized entry matches.
      const upper = await bookByEmail(
        {
          guest: {
            fullName: "Amina Hassan",
            email: "Amina@Example.TEST",
            phone,
            country: "EG",
          },
        },
        key("upper"),
      );
      expect(upper.ok).toBe(true);
      const counts = await rowCounts(client);
      expect(counts.reservations).toBe(1);
      expect(counts.consumed).toBe(1);
    });

    it("keeps a WhatsApp verified profile's contact and proof", async () => {
      await seedBookable(client);
      const first = await book(
        {
          guest: {
            fullName: "Phone Owner",
            email: "owner@example.test",
            phone,
            country: "EG",
          },
          marketingOptIn: { consentVersion: MARKETING },
        },
        key("owner"),
      );
      expect(first.ok).toBe(true);
      const before = await client.guest.findUniqueOrThrow({ where: { phone } });
      const second = await bookByEmail(
        { stay: { checkIn: "2031-05-10", checkOut: "2031-05-13" } },
        key("claimer"),
      );
      expect(second.ok).toBe(true);
      const after = await client.guest.findUniqueOrThrow({ where: { phone } });
      expect(after).toMatchObject({
        name: "Phone Owner",
        email: "owner@example.test",
        phoneVerifiedAt: before.phoneVerifiedAt,
        marketingConsentVersion: MARKETING,
        emailVerifiedAt: null,
      });
      // The reservation keeps what the email guest typed.
      const reservation = await client.reservation.findFirstOrThrow({
        where: { verificationChannel: "EMAIL" },
      });
      expect(reservation).toMatchObject({
        guestName: "Amina Hassan",
        guestEmail: email,
      });
    });

    it("leaves the contact of an unproven profile staff created at the desk alone", async () => {
      await seedBookable(client);
      await client.guest.create({
        data: {
          id: "desk-guest",
          phone,
          name: "Desk Guest",
          email: "desk@example.test",
        },
      });
      expect((await bookByEmail({}, key("desk-claimer"))).ok).toBe(true);
      expect(
        await client.guest.findUniqueOrThrow({ where: { phone } }),
      ).toMatchObject({
        name: "Desk Guest",
        email: "desk@example.test",
        phoneVerifiedAt: null,
        emailVerifiedAt: null,
        marketingConsentVersion: null,
      });
      expect(
        await client.reservation.findFirstOrThrow({
          where: { verificationChannel: "EMAIL" },
        }),
      ).toMatchObject({
        guestName: "Amina Hassan",
        guestEmail: email,
        verifiedEmail: email,
      });
    });

    it("neither applies nor reveals a per phone coupon limit, and stores the use without a phone", async () => {
      await seedBookable(client);
      await coupon(null, 1000, 1);
      const discounted = { amountMinor: 31_050, currency: "USD" };
      // The phone's owner has used the coupon once already, by WhatsApp.
      expect(
        (await book({ couponCode: "WELCOME", expectedTotal: discounted })).ok,
      ).toBe(true);
      const byEmail = await bookByEmail(
        {
          couponCode: "WELCOME",
          stay: { checkIn: "2031-05-10", checkOut: "2031-05-13" },
          expectedTotal: discounted,
        },
        key("coupon-email"),
      );
      expect(byEmail.ok).toBe(true);
      const redemptions = await client.couponRedemption.findMany({
        orderBy: { createdAt: "asc" },
        include: { reservation: { select: { verificationChannel: true } } },
      });
      expect(
        redemptions.map((row) => [
          row.reservation.verificationChannel,
          row.phone,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ["WHATSAPP", phone],
          ["EMAIL", null],
        ]),
      );
    });

    it("refuses a blocked phone", async () => {
      await seedBookable(client);
      const token = await emailToken();
      await client.guest.create({
        data: {
          id: "blocked-guest",
          phone,
          name: "Blocked",
          blockedAt: new Date("2031-02-01T00:00:00Z"),
          blockReason: "Test",
        },
      });
      const result = await websiteBooking(client).execute(
        bookingBody(phone, token),
        key("blocked"),
      );
      expectFailure(result, "PHONE_BLOCKED");
      expect((await rowCounts(client)).reservations).toBe(0);
    });

    it("counts against the phone cap and the per email cap", async () => {
      await seedBookable(client);
      const stays = [
        { checkIn: "2031-04-10", checkOut: "2031-04-13" },
        { checkIn: "2031-05-10", checkOut: "2031-05-13" },
        { checkIn: "2031-06-10", checkOut: "2031-06-13" },
      ];
      // Two email bookings from two different phones fill the email cap.
      expect(
        (await bookByEmail({ stay: stays[0] }, key("e1"), phoneOf(11))).ok,
      ).toBe(true);
      expect(
        (await bookByEmail({ stay: stays[1] }, key("e2"), phoneOf(12))).ok,
      ).toBe(true);
      expectFailure(
        await bookByEmail({ stay: stays[2] }, key("e3"), phoneOf(13)),
        "BOOKING_LIMIT_REACHED",
      );
      // WhatsApp bookings with that email do not count toward the email cap.
      expect((await book({ stay: stays[2] }, key("w1"), phoneOf(14))).ok).toBe(
        true,
      );
      // The phone cap still counts email bookings for the typed phone.
      await resetDatabase(client);
      await seedBookable(client);
      expect((await book({ stay: stays[0] }, key("p1"))).ok).toBe(true);
      expect((await book({ stay: stays[1] }, key("p2"))).ok).toBe(true);
      expectFailure(
        await bookByEmail({ stay: stays[2] }, key("p3"), phone),
        "BOOKING_LIMIT_REACHED",
      );
    });

    it("keeps counting a booking in the email cap after its contact email changes", async () => {
      await seedBookable(client);
      const stays = [
        { checkIn: "2031-04-10", checkOut: "2031-04-13" },
        { checkIn: "2031-05-10", checkOut: "2031-05-13" },
        { checkIn: "2031-06-10", checkOut: "2031-06-13" },
      ];
      for (const [index, stay] of stays.slice(0, 2).entries())
        expect(
          (
            await bookByEmail(
              { stay },
              key(`moved-${index}`),
              phoneOf(31 + index),
            )
          ).ok,
        ).toBe(true);
      expect(
        (
          await client.reservation.findMany({
            select: { verifiedEmail: true },
          })
        ).map((row) => row.verifiedEmail),
      ).toEqual([email, email]);
      // A guest change or a staff edit moves both contact emails elsewhere.
      await client.reservation.updateMany({
        data: { guestEmail: "moved@example.test" },
      });
      expectFailure(
        await bookByEmail({ stay: stays[2] }, key("moved-2"), phoneOf(33)),
        "BOOKING_LIMIT_REACHED",
      );
    });

    it("books when WhatsApp is not ready but email is", async () => {
      await seedBookable(client);
      const result = await bookByEmail({}, key("email-only"), phone, {
        setupConfigured: false,
        emailReady: true,
      });
      expect(result.ok).toBe(true);
    });

    it("C-VCH: two email bookings from different phones at the email cap book only one, waiting on the email lock (20 rounds)", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await resetDatabase(client);
        await seedBookable(client);
        await seedBookable(client, { slug: "nile" });
        expect((await bookByEmail({}, key("prior"), phoneOf(21))).ok).toBe(
          true,
        );
        const tokens = [
          await emailToken(phoneOf(22)),
          await emailToken(phoneOf(23)),
        ];
        const paused = pausedAudit();
        const results = await withIndependentClients(3, async (clients) => {
          const first = websiteBooking(clients[0]!, {
            audit: paused.audit,
          }).execute(
            bookingBody(phoneOf(22), tokens[0]!, {
              stay: { checkIn: "2031-05-10", checkOut: "2031-05-13" },
            }),
            key("race-a"),
          );
          await paused.reached;
          const second = websiteBooking(clients[1]!).execute(
            bookingBody(phoneOf(23), tokens[1]!, {
              lines: [
                { roomSlug: "nile", occupancy: { adults: 2, children: 0 } },
              ],
              stay: { checkIn: "2031-06-10", checkOut: "2031-06-13" },
            }),
            key("race-b"),
          );
          // Different phones, so only the email lock can make it wait.
          await waitForLockWaiters(clients[2]!, 1);
          paused.release();
          return Promise.all([first, second]);
        });
        expect(results[0]!.ok).toBe(true);
        expectFailure(results[1]!, "BOOKING_LIMIT_REACHED");
        expect((await rowCounts(client)).reservations).toBe(2);
      }
    }, 120_000);
  });

  describe("concurrency (20 rounds each)", () => {
    it("C-1: ten parallel bookings for the last unit give exactly one CONFIRMED", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await resetDatabase(client);
        await seedBookable(client, { units: 1 });
        const tokens = await Promise.all(
          Array.from({ length: 10 }, (_, index) =>
            issueToken(client, phoneOf(index)),
          ),
        );
        const results = await withIndependentClients(10, async (clients) => {
          // The first booking holds the listing lock until nine others queue.
          const gate = pausedAudit();
          const first = websiteBooking(clients[0]!, {
            audit: gate.audit,
          }).execute(bookingBody(phoneOf(0), tokens[0]!), key("c1-0"));
          await gate.reached;
          const others = clients
            .slice(1)
            .map((connection, index) =>
              websiteBooking(connection).execute(
                bookingBody(phoneOf(index + 1), tokens[index + 1]!),
                key(`c1-${index + 1}`),
              ),
            );
          await waitForLockWaiters(client, 9);
          gate.release();
          return Promise.all([first, ...others]);
        });
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        for (const result of results)
          if (!result.ok)
            expect(result.error.code).toBe("INVENTORY_UNAVAILABLE");
        expect(await rowCounts(client)).toMatchObject({
          reservations: 1,
          audits: 1,
          outbox: 3,
        });
      }
    }, 180_000);

    it("C-2: overlapping stays for one unit, in parallel, give exactly one booking", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await resetDatabase(client);
        await seedBookable(client, { units: 1 });
        const tokens = [
          await issueToken(client, phoneOf(0)),
          await issueToken(client, phoneOf(1)),
        ];
        const [first, second] = await withIndependentClients(
          2,
          async ([a, b]) => {
            const gate = pausedAudit();
            const winner = websiteBooking(a!, { audit: gate.audit }).execute(
              bookingBody(phoneOf(0), tokens[0]!),
              key("c2-0"),
            );
            await gate.reached;
            const loser = websiteBooking(b!).execute(
              bookingBody(phoneOf(1), tokens[1]!, {
                stay: { checkIn: "2031-04-12", checkOut: "2031-04-15" },
              }),
              key("c2-1"),
            );
            await waitForLockWaiters(client, 1);
            gate.release();
            return Promise.all([winner, loser]);
          },
        );
        expect(first.ok).toBe(true);
        expectFailure(second, "INVENTORY_UNAVAILABLE");
        expect((await rowCounts(client)).reservations).toBe(1);
      }
    }, 120_000);

    it("C-3: adjacent stays for one unit, in parallel, both succeed", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await resetDatabase(client);
        await seedBookable(client, { units: 1 });
        const tokens = [
          await issueToken(client, phoneOf(0)),
          await issueToken(client, phoneOf(1)),
        ];
        const results = await withIndependentClients(2, (clients) =>
          Promise.all([
            websiteBooking(clients[0]!).execute(
              bookingBody(phoneOf(0), tokens[0]!, {
                stay: { checkIn: "2031-04-10", checkOut: "2031-04-12" },
                expectedTotal: { amountMinor: 23_000, currency: "USD" },
              }),
              key("c3-0"),
            ),
            websiteBooking(clients[1]!).execute(
              bookingBody(phoneOf(1), tokens[1]!, {
                stay: { checkIn: "2031-04-12", checkOut: "2031-04-14" },
                expectedTotal: { amountMinor: 23_000, currency: "USD" },
              }),
              key("c3-1"),
            ),
          ]),
        );
        expect(results.every((result) => result.ok)).toBe(true);
        expect((await rowCounts(client)).reservations).toBe(2);
      }
    }, 120_000);

    it("C-9: a retry that waits on the guest lock replays the winner (second lookup)", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await resetDatabase(client);
        await seedBookable(client);
        const token = await issueToken(client, phone);
        const [winner, retry] = await withIndependentClients(
          2,
          async ([a, b]) => {
            const gate = pausedAudit();
            const winning = websiteBooking(a!, { audit: gate.audit }).execute(
              bookingBody(phone, token),
              key("c9"),
            );
            // The winner is uncommitted, so the retry's first lookup misses
            // and the retry then waits on the winner's guest row.
            await gate.reached;
            const retrying = websiteBooking(b!).execute(
              bookingBody(phone, token),
              key("c9"),
            );
            await waitForLockWaiters(client, 1);
            gate.release();
            return Promise.all([winning, retrying]);
          },
        );
        expect(winner.ok && !winner.value.replayed).toBe(true);
        // Without the lookup under the guest lock this would fail as
        // PHONE_NOT_VERIFIED, because the winner consumed the token.
        expect(retry.ok && retry.value.replayed).toBe(true);
        if (winner.ok && retry.ok) {
          expect(retry.value.reference).toBe(winner.value.reference);
          expect(retry.value.manageToken).toBeNull();
        }
        expect((await rowCounts(client)).reservations).toBe(1);
      }
    }, 120_000);

    it("one key used by two phones at once books one and refuses the other as a reused key", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await resetDatabase(client);
        await seedBookable(client);
        const tokens = [
          await issueToken(client, phoneOf(0)),
          await issueToken(client, phoneOf(1)),
        ];
        const results = await withIndependentClients(2, (clients) =>
          Promise.all(
            clients.map((connection, index) =>
              websiteBooking(connection).execute(
                bookingBody(phoneOf(index), tokens[index]!),
                key("shared"),
              ),
            ),
          ),
        );
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        const refused = results.find((result) => !result.ok);
        expect(refused && !refused.ok && refused.error.code).toBe(
          "IDEMPOTENCY_KEY_REUSED",
        );
        expect((await rowCounts(client)).reservations).toBe(1);
      }
    }, 120_000);

    it("two parallel bookings by one phone at the cap book only one", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await resetDatabase(client);
        await seedBookable(client);
        await seedBookable(client, { slug: "nile" });
        const first = await book({}, key("prior"));
        expect(first.ok).toBe(true);
        const tokens = [
          await issueToken(client, phone),
          await issueToken(client, phone),
        ];
        const results = await withIndependentClients(2, (clients) =>
          Promise.all([
            websiteBooking(clients[0]!).execute(
              bookingBody(phone, tokens[0]!, {
                stay: { checkIn: "2031-05-10", checkOut: "2031-05-13" },
              }),
              key("cap-a"),
            ),
            websiteBooking(clients[1]!).execute(
              bookingBody(phone, tokens[1]!, {
                lines: [
                  { roomSlug: "nile", occupancy: { adults: 2, children: 0 } },
                ],
                stay: { checkIn: "2031-06-10", checkOut: "2031-06-13" },
              }),
              key("cap-b"),
            ),
          ]),
        );
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        const refused = results.find((result) => !result.ok);
        expect(refused && !refused.ok && refused.error.code).toBe(
          "BOOKING_LIMIT_REACHED",
        );
        expect((await rowCounts(client)).reservations).toBe(2);
      }
    }, 120_000);

    it("C-11: the coupon lock alone orders bookings on different listings, and the last redemption goes to the first", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await resetDatabase(client);
        await seedBookable(client);
        await seedBookable(client, { slug: "nile" });
        await coupon(1);
        const tokens = [
          await issueToken(client, phoneOf(0)),
          await issueToken(client, phoneOf(1)),
        ];
        const withCoupon = (index: number, roomSlug: string) =>
          bookingBody(phoneOf(index), tokens[index]!, {
            lines: [{ roomSlug, occupancy: { adults: 2, children: 0 } }],
            couponCode: "WELCOME",
            expectedTotal: { amountMinor: 31_050, currency: "USD" },
          });
        const [first, second] = await withIndependentClients(
          2,
          async ([a, b]) => {
            const gate = pausedAudit();
            const winner = websiteBooking(a!, { audit: gate.audit }).execute(
              withCoupon(0, "garden"),
              key("k0"),
            );
            await gate.reached;
            // Another listing and another phone: nothing but the coupon row
            // can make this booking wait.
            const loser = websiteBooking(b!).execute(
              withCoupon(1, "nile"),
              key("k1"),
            );
            await waitForLockWaiters(client, 1);
            gate.release();
            return Promise.all([winner, loser]);
          },
        );
        expect(first.ok).toBe(true);
        expectFailure(second, "COUPON_INVALID");
        if (!second.ok && second.error.code === "COUPON_INVALID")
          expect(second.error.context.reason).toBe("LIMIT_REACHED");
        expect(await rowCounts(client)).toMatchObject({
          reservations: 1,
          redemptions: 1,
        });
      }
    }, 120_000);

    it("C-11: a coupon with two redemptions left, used on different listings, is redeemed exactly twice", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await resetDatabase(client);
        await seedBookable(client, { units: 3 });
        await seedBookable(client, { slug: "nile", units: 3 });
        await coupon(2);
        const tokens = await Promise.all(
          Array.from({ length: 6 }, (_, index) =>
            issueToken(client, phoneOf(index)),
          ),
        );
        const results = await withIndependentClients(6, (clients) =>
          Promise.all(
            clients.map((connection, index) =>
              // Different listings hold different locks, so only the coupon
              // row lock orders these bookings.
              websiteBooking(connection).execute(
                bookingBody(phoneOf(index), tokens[index]!, {
                  lines: [
                    {
                      roomSlug: index % 2 === 0 ? "garden" : "nile",
                      occupancy: { adults: 2, children: 0 },
                    },
                  ],
                  couponCode: "WELCOME",
                  expectedTotal: { amountMinor: 31_050, currency: "USD" },
                }),
                key(`c11-${index}`),
              ),
            ),
          ),
        );
        expect(results.filter((result) => result.ok)).toHaveLength(2);
        for (const result of results)
          if (!result.ok) expect(result.error.code).toBe("COUPON_INVALID");
        expect(await rowCounts(client)).toMatchObject({
          reservations: 2,
          redemptions: 2,
        });
      }
    }, 180_000);
  });
});
