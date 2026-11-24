import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DispatchOutbox } from "@/application/notifications";
import type { CheckoutInput, CheckoutResult } from "@/application/payments";
import { staffReservationCommands } from "@/composition/reservations";
import { PrismaOutboxWorkerStore } from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";
import { FakePaymentGateway } from "@/infrastructure/payments/fake/fake-payment-gateway";

import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  barrier,
  deferred,
  withIndependentClients,
} from "./support/concurrency";
import {
  bookingBody,
  issueToken,
  NOW,
  pausedAudit,
  phoneOf,
  rowCounts,
  seedBookable,
  seedBranch,
  TOTAL_MINOR,
  waitForLockWaiters,
  websiteBooking,
} from "./support/website-booking";

const client = createTestClient();
const phone = phoneOf(1);
const key = "online-booking-key";
const checkoutUrl = "https://gateway.example.test/checkout";
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const checkout = (
  createCheckout: (input: CheckoutInput) => Promise<CheckoutResult>,
) => ({
  provider: "test-gateway",
  gateway: { createCheckout },
  appUrl: "https://hotel.example",
});
const accepted = {
  ok: true,
  checkoutUrl,
  providerOrderId: "test-order",
} as const;
const couponBody = {
  couponCode: "WELCOME",
  expectedTotal: { amountMinor: 31_050, currency: "USD" },
};

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

async function ready(units = 1) {
  const room = await seedBookable(client, { units });
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { onlinePaymentEnabled: true },
  });
  return room;
}

async function coupon() {
  await client.coupon.create({
    data: {
      id: "coupon-1",
      code: "WELCOME",
      kind: "PERCENT",
      percentBasisPoints: 1000,
      maxRedemptions: 1,
      allBranches: true,
    },
  });
}

async function onlineBody(overrides: Record<string, unknown> = {}) {
  return bookingBody(phone, await issueToken(client, phone), {
    paymentMethod: "ONLINE",
    ...overrides,
  });
}

describe("online booking and held confirmations (AC-1, AC-4, T-PAY-5)", () => {
  it("commits the exact amount, inventory and held messages before the gateway call", async () => {
    await ready();
    await coupon();
    await withIndependentClients(1, async ([observer]) => {
      const createCheckout = vi.fn(async (input: CheckoutInput) => {
        const payment = await observer!.payment.findUniqueOrThrow({
          where: { id: input.paymentId },
          include: {
            reservation: {
              include: { rooms: true, redemption: true, notifications: true },
            },
          },
        });
        expect(payment).toMatchObject({
          status: "INITIATED",
          amountMinor: 31_050,
          currency: "USD",
          expiresAt: at(13),
          checkoutUrl: null,
          reservation: {
            status: "AWAITING_PAYMENT",
            paymentStatus: "AWAITING",
            holdExpiresAt: at(15),
            rooms: [{ consumesInventory: true }],
            redemption: { releasedAt: null },
          },
        });
        expect(input).toMatchObject({
          amountMinor: 31_050,
          currency: "USD",
          expiresAt: at(13),
          reference: payment.reservation.reference,
          customer: { name: "Amina Hassan", email: "amina@example.test" },
          returnUrl: "https://hotel.example/new-cairo/book/payment",
        });
        expect(payment.reservation.notifications).toHaveLength(3);
        expect(
          payment.reservation.notifications.every(
            ({ status }) => status === "HELD",
          ),
        ).toBe(true);
        expect(
          await new PrismaOutboxWorkerStore(observer!).claim(NOW),
        ).toBeNull();
        expect(
          await observer!.auditEvent.count({
            where: { action: "reservation.created" },
          }),
        ).toBe(1);
        return accepted;
      });
      const useCase = websiteBooking(client, {
        checkout: checkout(createCheckout),
      });
      const body = await onlineBody(couponBody);
      const created = await useCase.execute(body, key);
      expect(created).toMatchObject({
        ok: true,
        value: {
          status: "AWAITING_PAYMENT",
          holdExpiresAt: at(15),
          checkoutUrl,
          replayed: false,
        },
      });
      if (!created.ok) throw new Error(created.error.code);
      const payment = await client.payment.findFirstOrThrow();
      expect(payment).toMatchObject({
        checkoutUrl,
        providerOrderId: "test-order",
      });
      const held = await client.notificationOutbox.findMany({
        where: { kind: "reservation.confirmed" },
      });
      expect(held).toHaveLength(2);
      expect(
        held.every(({ payload }) =>
          JSON.stringify(payload).includes(created.value.manageToken!),
        ),
      ).toBe(true);
      const replay = await useCase.execute(body, key);
      expect(replay).toMatchObject({
        ok: true,
        value: {
          reference: created.value.reference,
          checkoutUrl,
          manageToken: null,
          replayed: true,
        },
      });
      expect(createCheckout).toHaveBeenCalledTimes(1);
      expect(
        await useCase.execute({ ...body, paymentMethod: "PAY_AT_HOTEL" }, key),
      ).toMatchObject({
        ok: false,
        error: { code: "IDEMPOTENCY_KEY_REUSED" },
      });
      const atCutoff = websiteBooking(client, {
        checkout: checkout(createCheckout),
        now: () => at(13),
      });
      const afterSession = await atCutoff.execute(body, key);
      expect(afterSession).toMatchObject({
        ok: true,
        value: { status: "AWAITING_PAYMENT", replayed: true },
      });
      if (!afterSession.ok) throw new Error(afterSession.error.code);
      expect(afterSession.value.checkoutUrl).toBeUndefined();
      expect(createCheckout).toHaveBeenCalledTimes(1);
    });
  });

  it("compensates a definite refusal and replays the failed booking (T-PAY-5)", async () => {
    await ready();
    await coupon();
    const createCheckout = vi.fn(
      async () => ({ ok: false, code: "PROVIDER_REJECTED" }) as const,
    );
    const useCase = websiteBooking(client, {
      checkout: checkout(createCheckout),
    });
    const body = await onlineBody(couponBody);
    expect(await useCase.execute(body, key)).toMatchObject({
      ok: false,
      error: { code: "PAYMENT_UNAVAILABLE" },
    });
    const payment = await client.payment.findFirstOrThrow({
      include: {
        reservation: {
          include: { rooms: true, redemption: true, notifications: true },
        },
      },
    });
    expect(payment).toMatchObject({
      status: "FAILED",
      checkoutUrl: null,
      lastError: "PROVIDER_REJECTED",
      reservation: {
        status: "PAYMENT_FAILED",
        paymentStatus: "FAILED",
        holdExpiresAt: null,
        rooms: [{ consumesInventory: false }],
        redemption: { releasedAt: NOW },
      },
    });
    expect(payment.reservation.notifications).toEqual([
      expect.objectContaining({
        channel: expect.any(String),
        kind: "reservation.payment-not-completed",
        status: "PENDING",
      }),
      expect.objectContaining({
        channel: expect.any(String),
        kind: "reservation.payment-not-completed",
        status: "PENDING",
      }),
    ]);
    expect(
      new Set(payment.reservation.notifications.map(({ channel }) => channel)),
    ).toEqual(new Set(["EMAIL", "WHATSAPP"]));
    expect(
      await client.auditEvent.count({
        where: { action: "payment.failed", entityId: payment.id },
      }),
    ).toBe(1);
    const replay = await useCase.execute(body, key);
    expect(replay).toMatchObject({
      ok: true,
      value: { status: "PAYMENT_FAILED", manageToken: null, replayed: true },
    });
    expect(createCheckout).toHaveBeenCalledTimes(1);
  });

  it.each(["UNAVAILABLE", "exception"] as const)(
    "keeps a hold after %s and recovers the same checkout payment under parallel replay",
    async (outage) => {
      await ready();
      const bothRetries = barrier(2);
      const createCheckout = vi
        .fn<(input: CheckoutInput) => Promise<CheckoutResult>>()
        .mockImplementationOnce(async () => {
          if (outage === "exception")
            throw new Error("simulated network failure");
          return { ok: false, code: "UNAVAILABLE" };
        })
        .mockImplementation(async () => {
          await bothRetries();
          return accepted;
        });
      const connection = checkout(createCheckout);
      const body = await onlineBody();
      expect(
        await websiteBooking(client, { checkout: connection }).execute(
          body,
          key,
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "PAYMENT_UNAVAILABLE" },
      });
      const initial = await client.payment.findFirstOrThrow({
        include: { reservation: true },
      });
      expect(initial).toMatchObject({
        status: "INITIATED",
        checkoutUrl: null,
        reservation: { status: "AWAITING_PAYMENT" },
      });
      expect(
        await client.notificationOutbox.count({ where: { status: "HELD" } }),
      ).toBe(3);
      await withIndependentClients(2, async (connections) => {
        const replays = await Promise.all(
          connections.map((actor) =>
            websiteBooking(actor, { checkout: connection }).execute(body, key),
          ),
        );
        for (const replay of replays)
          expect(replay).toMatchObject({
            ok: true,
            value: { checkoutUrl, manageToken: null, replayed: true },
          });
      });
      expect(
        createCheckout.mock.calls.map(([input]) => input.paymentId),
      ).toEqual(Array(3).fill(initial.id));
      expect(await client.payment.count()).toBe(1);
      expect(await rowCounts(client)).toMatchObject({
        reservations: 1,
        audits: 1,
        outbox: 3,
        consumed: 1,
      });
    },
  );

  it("retires a definitely refused checkout once when a matching retry overlaps", async () => {
    await ready();
    await coupon();
    const fake = new FakePaymentGateway({
      origin: "https://hotel.example",
      secret: "booking-integration-test",
      clock: { now: () => NOW },
    });
    const firstCalled = deferred();
    const retryCalled = deferred();
    const releaseRetry = deferred();
    const calls: string[] = [];
    const connection = checkout(async (input) => {
      calls.push(input.paymentId);
      if (calls.length === 1) {
        fake.setCheckoutFailure(input.paymentId, "PROVIDER_REJECTED");
        const result = await fake.createCheckout(input);
        firstCalled.resolve();
        await retryCalled.promise;
        return result;
      }
      const result = await fake.createCheckout(input);
      retryCalled.resolve();
      await releaseRetry.promise;
      return result;
    });
    const body = await onlineBody(couponBody);
    await withIndependentClients(2, async ([initial, retry]) => {
      const first = websiteBooking(initial!, { checkout: connection }).execute(
        body,
        key,
      );
      const reached = await Promise.race([
        firstCalled.promise.then(() => true),
        first.then(() => false),
      ]);
      expect(reached).toBe(true);
      const second = websiteBooking(retry!, { checkout: connection }).execute(
        body,
        key,
      );
      try {
        expect(
          await Promise.race([
            retryCalled.promise.then(() => true),
            second.then(() => false),
          ]),
        ).toBe(true);
        expect(await first).toMatchObject({
          ok: false,
          error: { code: "PAYMENT_UNAVAILABLE" },
        });
      } finally {
        retryCalled.resolve();
        releaseRetry.resolve();
        await Promise.allSettled([first, second]);
      }
      expect(await second).toMatchObject({
        ok: true,
        value: { status: "PAYMENT_FAILED", manageToken: null, replayed: true },
      });
    });
    const payment = await client.payment.findFirstOrThrow();
    expect(calls).toEqual([payment.id, payment.id]);
    expect(fake.readCheckout(payment.id)).toBeUndefined();
    expect(await fake.getTransaction({ paymentId: payment.id })).toBe(
      "NOT_FOUND",
    );
    expect(payment).toMatchObject({ status: "FAILED", checkoutUrl: null });
    expect(
      await client.couponRedemption.count({ where: { releasedAt: null } }),
    ).toBe(0);
    expect(
      await client.reservationRoom.count({
        where: { consumesInventory: true },
      }),
    ).toBe(0);
    expect(
      await client.auditEvent.count({ where: { action: "payment.failed" } }),
    ).toBe(1);
    expect(
      await client.notificationOutbox.count({
        where: { kind: "reservation.payment-not-completed" },
      }),
    ).toBe(2);
  });

  it("rolls back the initial hold if audit fails, without calling the gateway", async () => {
    await ready();
    await coupon();
    const createCheckout = vi.fn(async () => accepted);
    const useCase = websiteBooking(client, {
      checkout: checkout(createCheckout),
      audit: () => ({
        append: async () => {
          throw new Error("audit unavailable");
        },
      }),
    });
    await expect(
      useCase.execute(await onlineBody(couponBody), key),
    ).rejects.toThrow("audit unavailable");
    expect(createCheckout).not.toHaveBeenCalled();
    expect(await client.payment.count()).toBe(0);
    expect(await rowCounts(client)).toEqual({
      reservations: 0,
      redemptions: 0,
      audits: 0,
      outbox: 0,
      consumed: 0,
    });
  });

  it("replays when the winner commits between the retry's first lookup and token read", async () => {
    await ready();
    const body = await onlineBody();
    const connection = checkout(async () => accepted);
    const reached = deferred();
    const resume = deferred();
    await withIndependentClients(1, async ([rival]) => {
      const retry = websiteBooking(rival!, {
        checkout: connection,
        beforeTokenLookup: async () => {
          reached.resolve();
          await resume.promise;
        },
      }).execute(body, key);
      try {
        expect(
          await Promise.race([
            reached.promise.then(() => true),
            retry.then(() => false),
          ]),
        ).toBe(true);
        const first = await websiteBooking(client, {
          checkout: connection,
        }).execute(body, key);
        expect(first).toMatchObject({ ok: true, value: { replayed: false } });
      } finally {
        resume.resolve();
        await Promise.allSettled([retry]);
      }
      expect(await retry).toMatchObject({
        ok: true,
        value: { checkoutUrl, manageToken: null, replayed: true },
      });
      expect(await client.payment.count()).toBe(1);
    });
  });

  it("serializes one open hold per verified phone across branches", async () => {
    await ready();
    const otherBranch = "branch-elsewhere";
    await seedBranch(client, { id: otherBranch, slug: "elsewhere" });
    await seedBookable(client, {
      branchId: otherBranch,
      slug: "second-garden",
    });
    await client.branch.update({
      where: { id: otherBranch },
      data: { onlinePaymentEnabled: true },
    });
    const first = await onlineBody();
    const second = await onlineBody({
      branchSlug: "elsewhere",
      lines: [
        { roomSlug: "second-garden", occupancy: { adults: 2, children: 0 } },
      ],
    });
    const connection = checkout(async () => accepted);
    const paused = pausedAudit();
    await withIndependentClients(2, async ([booking, rival]) => {
      const winner = websiteBooking(booking!, {
        checkout: connection,
        audit: paused.audit,
      }).execute(first, key);
      const started = await Promise.race([
        paused.reached.then(() => true),
        winner.then(() => false),
      ]);
      expect(started).toBe(true);
      const contender = websiteBooking(rival!, {
        checkout: connection,
      }).execute(second, "rival-online-key");
      try {
        await waitForLockWaiters(client, 1);
      } finally {
        paused.release();
        await Promise.allSettled([winner, contender]);
      }
      expect(await winner).toMatchObject({ ok: true });
      expect(await contender).toMatchObject({
        ok: false,
        error: { code: "BOOKING_LIMIT_REACHED" },
      });
    });
    expect(await client.payment.count()).toBe(1);
    expect((await rowCounts(client)).consumed).toBe(1);
  });

  it("does not let a late checkout response overwrite an expired hold", async () => {
    await ready();
    const called = deferred();
    const respond = deferred<CheckoutResult>();
    const connection = checkout(async () => {
      called.resolve();
      return respond.promise;
    });
    let now = NOW;
    const body = await onlineBody();
    const initial = websiteBooking(client, {
      checkout: connection,
      now: () => now,
    }).execute(body, key);
    expect(
      await Promise.race([
        called.promise.then(() => true),
        initial.then(() => false),
      ]),
    ).toBe(true);
    try {
      now = at(15);
      const rival = phoneOf(2);
      const competingBooking = bookingBody(
        rival,
        await issueToken(client, rival),
      );
      expect(
        await websiteBooking(client, { now: () => now }).execute(
          competingBooking,
          "new-pay-at-hotel-key",
        ),
      ).toMatchObject({ ok: true, value: { status: "CONFIRMED" } });
    } finally {
      respond.resolve(accepted);
      await Promise.allSettled([initial]);
    }
    expect(await initial).toMatchObject({
      ok: false,
      error: { code: "PAYMENT_UNAVAILABLE" },
    });
    const payment = await client.payment.findFirstOrThrow();
    expect(payment).toMatchObject({
      status: "EXPIRED",
      checkoutUrl: null,
    });
    const sendEmail = vi.fn(async () => ({ ok: true }) as const);
    const sendWhatsApp = vi.fn(
      async () => ({ ok: true, providerMessageId: "test-message" }) as const,
    );
    const worker = new DispatchOutbox(
      new PrismaOutboxWorkerStore(client),
      { send: sendEmail },
      { send: sendWhatsApp },
      { now: () => now },
    );
    await worker.run();
    const deadline = at(15).toISOString();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "reservation.payment-not-completed",
      expect.objectContaining({ holdExpiresAt: deadline }),
    );
    expect(sendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "PAYMENT_NOT_COMPLETED",
        variables: expect.objectContaining({ holdExpiresAt: deadline }),
      }),
    );
    const rows = await client.notificationOutbox.findMany({
      where: { reservationId: payment.reservationId },
    });
    expect(
      rows.filter(
        ({ status, attempts }) => status === "HELD" && attempts === 0,
      ),
    ).toHaveLength(3);
    expect(
      rows.filter(
        ({ status, payload }) =>
          status === "SENT" && JSON.stringify(payload) === "{}",
      ),
    ).toHaveLength(2);
  });

  it("expires the last unit under the listing lock once across 20 competing booking rounds (C-14)", async () => {
    await withIndependentClients(2, async ([first, second]) => {
      for (let round = 0; round < 20; round++) {
        if (round > 0) await resetDatabase(client);
        const listing = await ready();
        await coupon();
        const held = await websiteBooking(client, {
          checkout: checkout(async () => accepted),
        }).execute(await onlineBody(couponBody), key);
        if (!held.ok) throw new Error(held.error.code);
        const expiredAt = () => at(15);
        const firstPhone = phoneOf(2);
        const secondPhone = phoneOf(3);
        const firstBody = bookingBody(
          firstPhone,
          await issueToken(client, firstPhone),
          couponBody,
        );
        const secondBody = bookingBody(
          secondPhone,
          await issueToken(client, secondPhone),
        );
        const paused = pausedAudit();
        // The expiry audit occurs before insertion. Pause only on the fresh booking's audit so all writes are on the lock holder.
        const audit = (inner: Parameters<typeof paused.audit>[0]) => ({
          append: (event: Parameters<typeof inner.append>[0]) =>
            event.action === "reservation.created"
              ? paused.audit(inner).append(event)
              : inner.append(event),
        });
        const winner = websiteBooking(first!, {
          now: expiredAt,
          audit,
        }).execute(firstBody, "new-booking-first");
        expect(
          await Promise.race([
            paused.reached.then(() => true),
            winner.then(() => false),
          ]),
        ).toBe(true);
        const rival = websiteBooking(second!, { now: expiredAt }).execute(
          secondBody,
          "new-booking-second",
        );
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          paused.release();
          await Promise.allSettled([winner, rival]);
        }
        expect(await winner).toMatchObject({
          ok: true,
          value: { status: "CONFIRMED" },
        });
        expect(await rival).toMatchObject({
          ok: false,
          error: { code: "INVENTORY_UNAVAILABLE" },
        });
        expect(
          await client.reservationRoom.count({
            where: { roomTypeId: listing.id, consumesInventory: true },
          }),
        ).toBe(1);
        const payment = await client.payment.findFirstOrThrow({
          include: {
            reservation: { include: { redemption: true, notifications: true } },
          },
        });
        expect(payment).toMatchObject({
          status: "EXPIRED",
          reservation: {
            status: "PAYMENT_FAILED",
            paymentStatus: "FAILED",
            redemption: { releasedAt: at(15) },
          },
        });
        expect(
          payment.reservation.notifications.filter(
            ({ status }) => status === "HELD",
          ),
        ).toHaveLength(3);
        expect(
          payment.reservation.notifications.filter(
            ({ kind, status }) =>
              kind === "reservation.payment-not-completed" &&
              status === "PENDING",
          ),
        ).toHaveLength(2);
        expect(
          await client.auditEvent.count({
            where: { action: "payment.expired", entityId: payment.id },
          }),
        ).toBe(1);
        expect(
          await client.couponRedemption.count({ where: { releasedAt: null } }),
        ).toBe(1);
      }
    });
  }, 60_000);

  it("rolls back an expiry and its messages if the new booking fails", async () => {
    await ready();
    await coupon();
    const held = await websiteBooking(client, {
      checkout: checkout(async () => accepted),
    }).execute(await onlineBody(couponBody), key);
    if (!held.ok) throw new Error(held.error.code);
    const rival = phoneOf(2);
    const body = bookingBody(rival, await issueToken(client, rival), {
      expectedTotal: { amountMinor: TOTAL_MINOR - 1, currency: "USD" },
    });
    expect(
      await websiteBooking(client, { now: () => at(15) }).execute(
        body,
        "new-invalid-total",
      ),
    ).toMatchObject({ ok: false, error: { code: "PRICE_CHANGED" } });
    expect(await client.payment.findFirstOrThrow()).toMatchObject({
      status: "INITIATED",
    });
    expect(
      await client.couponRedemption.count({ where: { releasedAt: null } }),
    ).toBe(1);
    expect(
      await client.reservationRoom.count({
        where: { consumesInventory: true },
      }),
    ).toBe(1);
    expect(
      await client.notificationOutbox.count({ where: { status: "HELD" } }),
    ).toBe(3);
    expect(
      await client.notificationOutbox.count({ where: { status: "PENDING" } }),
    ).toBe(0);
    expect(
      await client.auditEvent.count({ where: { action: "payment.expired" } }),
    ).toBe(0);
  });

  it.each(["STAFF", "EXTERNAL"] as const)(
    "reclaims an expired hold when creating a %s reservation",
    async (source) => {
      const room = await ready();
      await createActor(client);
      const held = await websiteBooking(client, {
        checkout: checkout(async () => accepted),
      }).execute(await onlineBody(), key);
      if (!held.ok) throw new Error(held.error.code);
      const actor = {
        id: "actor-admin",
        name: "Test Admin",
        email: "admin@example.test",
        role: "ADMIN",
        sessionId: "staff-test",
        branchIds: [],
      } as const;
      const body = {
        branchId: TEST_BRANCH_ID,
        stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
        lines: [{ roomTypeId: room.id, occupancy: { adults: 2, children: 0 } }],
        guest: {
          fullName: "Test Visitor",
          phone: phoneOf(2),
          email: "visitor@example.test",
        },
      };
      const commands = staffReservationCommands({
        client,
        clock: { now: () => at(15) },
      });
      const created =
        source === "STAFF"
          ? await commands.create.execute(
              actor,
              { ...body, sendConfirmation: false },
              "staff-booking-key",
            )
          : await commands.recordExternal.execute(
              actor,
              {
                ...body,
                externalReference: "external-booking",
                channel: "Test partner",
              },
              "external-booking-key",
            );
      expect(created).toMatchObject({
        ok: true,
        value: { reservation: { status: "CONFIRMED", source } },
      });
      expect(await client.payment.findFirstOrThrow()).toMatchObject({
        status: "EXPIRED",
      });
      expect(
        await client.reservationRoom.count({
          where: { consumesInventory: true },
        }),
      ).toBe(1);
    },
  );
});
