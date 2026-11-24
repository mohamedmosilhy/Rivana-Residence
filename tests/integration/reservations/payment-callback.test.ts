import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DispatchOutbox } from "@/application/notifications";
import type { CheckoutResult } from "@/application/payments";
import { PrismaOutboxWorkerStore } from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";

import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { withIndependentClients } from "./support/concurrency";
import {
  callbackEvent,
  paymentCallback,
  PROVIDER,
  signed,
} from "./support/payment-callback";
import {
  bookingBody,
  issueToken,
  NOW,
  pausedAudit,
  phoneOf,
  seedBookable,
  waitForLockWaiters,
  websiteBooking,
} from "./support/website-booking";

const client = createTestClient();
const phone = phoneOf(1);
const accepted: CheckoutResult = {
  ok: true,
  checkoutUrl: "https://gateway.example.test/checkout",
  providerOrderId: "order-1",
};
const connection = {
  provider: PROVIDER,
  gateway: { createCheckout: async () => accepted },
  appUrl: "https://hotel.example",
};

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

async function book(options: { coupon?: boolean } = {}) {
  await seedBookable(client, { units: 1 });
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { onlinePaymentEnabled: true },
  });
  if (options.coupon)
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
  const body = bookingBody(phone, await issueToken(client, phone), {
    paymentMethod: "ONLINE",
    ...(options.coupon
      ? {
          couponCode: "WELCOME",
          expectedTotal: { amountMinor: 31_050, currency: "USD" },
        }
      : {}),
  });
  const created = await websiteBooking(client, {
    checkout: connection,
  }).execute(body, "callback-booking-key");
  if (!created.ok) throw new Error(created.error.code);
  return client.payment.findFirstOrThrow({ include: { reservation: true } });
}

const reservationOf = (id: string) =>
  client.reservation.findUniqueOrThrow({
    where: { id },
    include: { rooms: true, notifications: true, redemption: true },
  });

/** A rival takes the unit, as after a hold ended. */
async function resale() {
  const rival = phoneOf(2);
  const result = await websiteBooking(client).execute(
    bookingBody(rival, await issueToken(client, rival)),
    "rival-booking-key",
  );
  if (!result.ok) throw new Error(result.error.code);
}

describe("payment callback (AC-1, AC-2, AC-3, AC-5)", () => {
  it("confirms an awaiting booking once and releases the held messages", async () => {
    const payment = await book();
    const { useCase } = paymentCallback(client);
    const event = callbackEvent(payment);
    expect(await useCase.execute(signed(event))).toMatchObject({ ok: true });

    const reservation = await reservationOf(payment.reservationId);
    expect(reservation).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      holdExpiresAt: null,
      rooms: [{ consumesInventory: true }],
    });
    expect(
      await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toMatchObject({
      status: "SUCCEEDED",
      providerTransactionId: event.providerTransactionId,
    });
    expect(
      await client.paymentEvent.findMany({
        where: { providerEventId: event.providerEventId },
      }),
    ).toEqual([
      expect.objectContaining({ result: "APPLIED", paymentId: payment.id }),
    ]);
    expect(reservation.notifications).toHaveLength(3);
    expect(
      reservation.notifications.every((row) => row.status === "PENDING"),
    ).toBe(true);
    expect(
      await client.auditEvent.count({
        where: { action: "payment.succeeded", entityId: payment.id },
      }),
    ).toBe(1);

    const sendEmail = vi.fn(async () => ({ ok: true }) as const);
    const worker = new DispatchOutbox(
      new PrismaOutboxWorkerStore(client),
      { send: sendEmail },
      {
        send: async () =>
          ({ ok: true, providerMessageId: "message-1" }) as const,
      },
      { now: () => NOW },
    );
    await worker.run();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "reservation.confirmed",
      expect.objectContaining({ manageLink: expect.stringContaining("#t=") }),
    );
  });

  it("applies five parallel duplicates once (C-13)", async () => {
    const payment = await book();
    const event = callbackEvent(payment);
    await withIndependentClients(5, async (clients) => {
      const results = await Promise.all(
        clients.map((connection) =>
          paymentCallback(connection).useCase.execute(signed(event)),
        ),
      );
      expect(results.every((result) => result.ok)).toBe(true);
    });
    expect(
      await client.paymentEvent.count({
        where: { providerEventId: event.providerEventId, result: "APPLIED" },
      }),
    ).toBe(1);
    expect(await client.paymentEvent.count()).toBe(1);
    expect(
      await client.auditEvent.count({ where: { action: "payment.succeeded" } }),
    ).toBe(1);
    const reservation = await reservationOf(payment.reservationId);
    expect(reservation.version).toBe(payment.reservation.version + 1);
    expect(
      reservation.notifications.filter((row) => row.status === "PENDING"),
    ).toHaveLength(3);
  });

  it("refuses forged and altered callbacks without changing anything (AC-2)", async () => {
    const payment = await book();
    const { useCase } = paymentCallback(client);
    const event = callbackEvent(payment);
    const good = signed(event);
    const tampered = {
      ...good,
      rawBody: new TextEncoder().encode(
        JSON.stringify({ ...event, amountMinor: 1 }),
      ),
    };
    const unsigned = { ...good, headers: new Headers() };
    const wrong = {
      ...good,
      headers: new Headers({ "x-fake-payment-signature": "0".repeat(64) }),
    };
    for (const input of [tampered, unsigned, wrong])
      expect(await useCase.execute(input)).toMatchObject({
        ok: false,
        error: { code: "WEBHOOK_SIGNATURE_INVALID" },
      });
    expect(await client.paymentEvent.count()).toBe(0);
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "AWAITING_PAYMENT",
      paymentStatus: "AWAITING",
    });
  });

  it.each([
    ["amount", { amountMinor: 1 }, "IGNORED_MISMATCH"],
    ["currency", { currency: "EUR" }, "IGNORED_MISMATCH"],
    ["payment", { paymentId: "no-such-payment" }, "IGNORED_UNKNOWN"],
  ] as const)(
    "acknowledges a %s mismatch and changes nothing",
    async (_name, override, result) => {
      const payment = await book();
      const event = callbackEvent(payment, override);
      expect(
        await paymentCallback(client).useCase.execute(signed(event)),
      ).toMatchObject({ ok: true });
      expect(
        await client.paymentEvent.findUniqueOrThrow({
          where: { providerEventId: event.providerEventId },
        }),
      ).toMatchObject({
        result,
        paymentId: result === "IGNORED_UNKNOWN" ? null : payment.id,
      });
      expect(await reservationOf(payment.reservationId)).toMatchObject({
        status: "AWAITING_PAYMENT",
      });
      expect(
        await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      ).toMatchObject({ status: "INITIATED" });
    },
  );

  it("keeps the hold after a decline and ends it when the session closes", async () => {
    const payment = await book({ coupon: true });
    const { useCase } = paymentCallback(client);
    await useCase.execute(
      signed(callbackEvent(payment, { outcome: "DECLINED" })),
    );
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "AWAITING_PAYMENT",
    });
    await useCase.execute(
      signed(callbackEvent(payment, { outcome: "SESSION_CLOSED" })),
    );
    const reservation = await reservationOf(payment.reservationId);
    expect(reservation).toMatchObject({
      status: "PAYMENT_FAILED",
      rooms: [{ consumesInventory: false }],
      redemption: { releasedAt: NOW },
    });
    expect(
      await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toMatchObject({ status: "EXPIRED" });
    // Held confirmations are kept for a possible late success.
    expect(
      reservation.notifications.filter((row) => row.status === "HELD"),
    ).toHaveLength(3);
  });

  it("records a refund result and leaves it for the refund task", async () => {
    const payment = await book();
    const event = callbackEvent(payment, {
      kind: "REFUND",
      outcome: "REFUND_SUCCEEDED",
      refundAttemptKey: `${payment.id}:refund:1`,
    });
    expect(
      await paymentCallback(client).useCase.execute(signed(event)),
    ).toMatchObject({ ok: true });
    expect(
      await client.paymentEvent.findUniqueOrThrow({
        where: { providerEventId: event.providerEventId },
      }),
    ).toMatchObject({ result: "IGNORED_STATE", kind: "REFUND" });
    expect(
      await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toMatchObject({ status: "INITIATED" });
  });
});

describe("late success (PY-5, C-12)", () => {
  async function expired(coupon = false) {
    const payment = await book({ coupon });
    const { useCase } = paymentCallback(client);
    await useCase.execute(
      signed(callbackEvent(payment, { outcome: "SESSION_CLOSED" })),
    );
    return { payment, useCase };
  }

  it("confirms again when every unit is still free and releases the held messages", async () => {
    const { payment, useCase } = await expired(true);
    expect(await useCase.execute(signed(callbackEvent(payment)))).toMatchObject(
      { ok: true },
    );
    const reservation = await reservationOf(payment.reservationId);
    expect(reservation).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      rooms: [{ consumesInventory: true }],
      redemption: { releasedAt: null },
    });
    expect(
      await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toMatchObject({ status: "SUCCEEDED" });
    expect(
      reservation.notifications.filter(
        (row) =>
          row.kind === "reservation.confirmed" && row.status === "PENDING",
      ),
    ).toHaveLength(2);
    expect(
      await client.auditEvent.findFirstOrThrow({
        where: { action: "payment.succeeded" },
      }),
    ).toMatchObject({ changes: expect.objectContaining({ late: true }) });
  });

  it("refunds automatically when the unit was resold", async () => {
    const { payment, useCase } = await expired();
    await resale();
    const event = callbackEvent(payment);
    expect(await useCase.execute(signed(event))).toMatchObject({ ok: true });
    const reservation = await reservationOf(payment.reservationId);
    expect(reservation).toMatchObject({
      status: "PAYMENT_FAILED",
      paymentStatus: "REFUND_PENDING",
      rooms: [{ consumesInventory: false }],
    });
    const stored = await client.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored).toMatchObject({
      status: "REFUND_PENDING",
      refundAttempt: 1,
      refundProviderId: "refund-1",
    });
    expect(stored.refundRequestedAt).not.toBeNull();
    expect(
      await client.paymentEvent.findUniqueOrThrow({
        where: { providerEventId: event.providerEventId },
      }),
    ).toMatchObject({ result: "APPLIED" });
    const kinds = reservation.notifications.map((row) => row.kind);
    expect(
      kinds.filter((kind) => kind === "payment.auto-refunded"),
    ).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "payment.staff-alert")).toHaveLength(
      1,
    );
    expect(
      reservation.notifications.filter(
        (row) =>
          row.kind === "reservation.confirmed" && row.status === "PENDING",
      ),
    ).toHaveLength(0);
  });

  it("calls the gateway once with a stable refund key after the unit was resold", async () => {
    await book();
    const payment = await client.payment.findFirstOrThrow();
    const { useCase, refund } = paymentCallback(client);
    await useCase.execute(
      signed(callbackEvent(payment, { outcome: "SESSION_CLOSED" })),
    );
    await resale();
    const event = callbackEvent(payment);
    await useCase.execute(signed(event));
    await useCase.execute(signed(event));
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith({
      paymentId: payment.id,
      providerTransactionId: event.providerTransactionId,
      amountMinor: payment.amountMinor,
      currency: "USD",
      idempotencyKey: `${payment.id}:refund:1`,
    });
  });

  it("leaves the refund unsent for the sweep when the gateway call fails", async () => {
    const { payment } = await expired();
    await resale();
    const { useCase } = paymentCallback(client, {
      refund: async () => {
        throw new Error("network");
      },
    });
    expect(await useCase.execute(signed(callbackEvent(payment)))).toMatchObject(
      { ok: true },
    );
    expect(
      await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toMatchObject({
      status: "REFUND_PENDING",
      refundRequestedAt: null,
    });
  });

  it("queues a fresh confirmation with a new link when the held rows are gone", async () => {
    const { payment, useCase } = await expired();
    const before = await client.reservation.findUniqueOrThrow({
      where: { id: payment.reservationId },
    });
    await client.notificationOutbox.deleteMany({ where: { status: "HELD" } });
    await useCase.execute(signed(callbackEvent(payment)));
    const after = await reservationOf(payment.reservationId);
    expect(after.manageTokenHash).not.toBe(before.manageTokenHash);
    expect(
      after.notifications.filter(
        (row) =>
          row.kind === "reservation.confirmed" && row.status === "PENDING",
      ),
    ).toHaveLength(2);
  });
});

describe("held confirmation recipients (T4 handoff)", () => {
  it("sends to the current email with a working link after an email change and link rotation", async () => {
    const payment = await book();
    await client.reservation.update({
      where: { id: payment.reservationId },
      data: { guestEmail: "new-address@example.test", manageTokenHash: null },
    });
    await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment)),
    );
    const reservation = await reservationOf(payment.reservationId);
    expect(reservation.manageTokenHash).not.toBeNull();
    const confirmations = reservation.notifications.filter(
      (row) => row.kind === "reservation.confirmed",
    );
    expect(confirmations.every((row) => row.status === "PENDING")).toBe(true);
    const email = confirmations.find((row) => row.channel === "EMAIL");
    expect(email?.recipient).toBe("new-address@example.test");
    const link = (email!.payload as { manageLink: string }).manageLink;
    const token = decodeURIComponent(new URL(link).hash.slice(3));
    const { createHash } = await import("node:crypto");
    expect(createHash("sha256").update(token).digest("hex")).toBe(
      reservation.manageTokenHash,
    );
    expect(
      reservation.notifications.filter((row) => row.status === "HELD"),
    ).toHaveLength(0);
  });
});

describe("late success racing a resale of the last unit (C-12), 20 rounds", () => {
  const rounds = Array.from({ length: 20 }, (_, round) => round);

  async function setup() {
    const payment = await book();
    await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment, { outcome: "SESSION_CLOSED" })),
    );
    const rival = phoneOf(2);
    const body = bookingBody(rival, await issueToken(client, rival));
    return { payment, body };
  }

  const consuming = () =>
    client.reservationRoom.count({ where: { consumesInventory: true } });

  it("refunds when the rival holds the listing lock first", async () => {
    await withIndependentClients(2, async ([first, second]) => {
      for (const round of rounds) {
        if (round > 0) await resetDatabase(client);
        const { payment, body } = await setup();
        const paused = pausedAudit();
        const audit = (inner: Parameters<typeof paused.audit>[0]) => ({
          append: (event: Parameters<typeof inner.append>[0]) =>
            event.action === "reservation.created"
              ? paused.audit(inner).append(event)
              : inner.append(event),
        });
        const rival = websiteBooking(first!, { audit }).execute(
          body,
          "rival-booking-key",
        );
        expect(
          await Promise.race([
            paused.reached.then(() => true),
            rival.then(() => false),
          ]),
        ).toBe(true);
        const { useCase, refund } = paymentCallback(second!);
        const callback = useCase.execute(signed(callbackEvent(payment)));
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          paused.release();
          await Promise.allSettled([rival, callback]);
        }
        expect(await rival).toMatchObject({ ok: true });
        expect(await callback).toMatchObject({ ok: true });
        expect(refund).toHaveBeenCalledTimes(1);
        expect(await consuming()).toBe(1);
        expect(
          await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
        ).toMatchObject({ status: "REFUND_PENDING" });
        expect(
          await client.reservation.findUniqueOrThrow({
            where: { id: payment.reservationId },
          }),
        ).toMatchObject({ status: "PAYMENT_FAILED" });
      }
    });
  });

  it("confirms the paid booking and refuses the rival when the callback holds the lock first", async () => {
    await withIndependentClients(2, async ([first, second]) => {
      for (const round of rounds) {
        if (round > 0) await resetDatabase(client);
        const { payment, body } = await setup();
        const paused = pausedAudit();
        const audit = (inner: Parameters<typeof paused.audit>[0]) => ({
          append: (event: Parameters<typeof inner.append>[0]) =>
            event.action === "payment.succeeded"
              ? paused.audit(inner).append(event)
              : inner.append(event),
        });
        const { useCase, refund } = paymentCallback(first!, { audit });
        const callback = useCase.execute(signed(callbackEvent(payment)));
        expect(
          await Promise.race([
            paused.reached.then(() => true),
            callback.then(() => false),
          ]),
        ).toBe(true);
        const rival = websiteBooking(second!).execute(
          body,
          "rival-booking-key",
        );
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          paused.release();
          await Promise.allSettled([rival, callback]);
        }
        expect(await callback).toMatchObject({ ok: true });
        expect(await rival).toMatchObject({
          ok: false,
          error: { code: "INVENTORY_UNAVAILABLE" },
        });
        expect(refund).not.toHaveBeenCalled();
        expect(await consuming()).toBe(1);
        expect(
          await client.reservation.findUniqueOrThrow({
            where: { id: payment.reservationId },
          }),
        ).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
      }
    });
  });
});

describe("callback paths the review asked to cover", () => {
  it("redoes a success under the listing locks when the hold ended after the unlocked read", async () => {
    const payment = await book();
    await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment, { outcome: "SESSION_CLOSED" })),
    );
    const { useCase } = paymentCallback(client, {
      staleStatus: "AWAITING_PAYMENT",
    });
    expect(await useCase.execute(signed(callbackEvent(payment)))).toMatchObject(
      { ok: true },
    );
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      rooms: [{ consumesInventory: true }],
    });
    expect(
      await client.auditEvent.findFirstOrThrow({
        where: { action: "payment.succeeded" },
      }),
    ).toMatchObject({ changes: expect.objectContaining({ late: true }) });
  });

  it("applies five parallel copies of a late success once", async () => {
    const payment = await book();
    await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment, { outcome: "SESSION_CLOSED" })),
    );
    const event = callbackEvent(payment);
    await withIndependentClients(5, async (clients) => {
      const results = await Promise.all(
        clients.map((connection) =>
          paymentCallback(connection).useCase.execute(signed(event)),
        ),
      );
      expect(results.every((result) => result.ok)).toBe(true);
    });
    expect(
      await client.paymentEvent.count({
        where: { providerEventId: event.providerEventId, result: "APPLIED" },
      }),
    ).toBe(1);
    expect(
      await client.auditEvent.count({ where: { action: "payment.succeeded" } }),
    ).toBe(1);
  });

  it("refunds a success that reaches a cancelled booking", async () => {
    const payment = await book();
    await client.reservation.update({
      where: { id: payment.reservationId },
      data: { status: "CANCELLED", holdExpiresAt: null },
    });
    await client.reservationRoom.updateMany({
      where: { reservationId: payment.reservationId },
      data: { consumesInventory: false },
    });
    const { useCase, refund } = paymentCallback(client);
    await useCase.execute(signed(callbackEvent(payment)));
    expect(refund).toHaveBeenCalledTimes(1);
    expect(
      await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toMatchObject({ status: "REFUND_PENDING" });
    const kinds = (
      await client.notificationOutbox.findMany({
        where: { reservationId: payment.reservationId, status: "PENDING" },
      })
    ).map((row) => row.kind);
    expect(
      kinds.filter((kind) => kind === "payment.auto-refunded"),
    ).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "payment.staff-alert")).toHaveLength(
      1,
    );
  });

  it("leaves a refund unsent when the gateway gave no transaction id", async () => {
    const payment = await book();
    await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment, { outcome: "SESSION_CLOSED" })),
    );
    await resale();
    const { providerTransactionId: _omit, ...event } = callbackEvent(payment);
    const { useCase, refund } = paymentCallback(client);
    await useCase.execute(signed(event as never));
    expect(refund).not.toHaveBeenCalled();
    expect(
      await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toMatchObject({ status: "REFUND_PENDING", refundRequestedAt: null });
  });

  it("discards held confirmations that carry raw links when it refunds automatically", async () => {
    const payment = await book();
    await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment, { outcome: "SESSION_CLOSED" })),
    );
    await resale();
    await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment)),
    );
    expect(
      await client.notificationOutbox.count({
        where: { reservationId: payment.reservationId, status: "HELD" },
      }),
    ).toBe(0);
  });

  it("refuses a verified event whose ids cannot be stored, and records an out of range amount safely", async () => {
    const payment = await book();
    const { useCase } = paymentCallback(client);
    expect(
      await useCase.execute(
        signed(callbackEvent(payment, { providerEventId: "x".repeat(121) })),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "WEBHOOK_SIGNATURE_INVALID" },
    });
    const huge = callbackEvent(payment, { amountMinor: 2 ** 40 });
    expect(await useCase.execute(signed(huge))).toMatchObject({ ok: true });
    expect(
      await client.paymentEvent.findUniqueOrThrow({
        where: { providerEventId: huge.providerEventId },
      }),
    ).toMatchObject({ result: "IGNORED_MISMATCH", amountMinor: null });
  });
});
