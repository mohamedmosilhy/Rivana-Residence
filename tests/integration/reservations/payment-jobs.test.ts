import { spawnSync } from "node:child_process";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CheckoutResult } from "@/application/payments";
import {
  PAYMENT_JOB_LOCK_KEYS,
  runPaymentJobOn,
} from "@/composition/payment-jobs";
import { PrismaBookingPaymentStore } from "@/infrastructure/db/prisma/repositories/reservations/booking-payment-store";

import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { testDatabaseUrl } from "../support/test-database";
import { withIndependentClients } from "./support/concurrency";
import {
  callbackEvent,
  paymentCallback,
  paymentJobs,
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
/** The hold lasts 15 minutes and the gateway session 13. */
const after = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const inJob = (minutes: number) => ({ now: () => after(minutes) });

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
  const phone = phoneOf(1);
  const created = await websiteBooking(client, {
    checkout: connection,
  }).execute(
    bookingBody(phone, await issueToken(client, phone), {
      paymentMethod: "ONLINE",
      ...(options.coupon
        ? {
            couponCode: "WELCOME",
            expectedTotal: { amountMinor: 31_050, currency: "USD" },
          }
        : {}),
    }),
    "jobs-booking-key",
  );
  if (!created.ok) throw new Error(created.error.code);
  return client.payment.findFirstOrThrow({ include: { reservation: true } });
}

const reservationOf = (id: string) =>
  client.reservation.findUniqueOrThrow({
    where: { id },
    include: { rooms: true, notifications: true, redemption: true },
  });

const paymentOf = (id: string) =>
  client.payment.findUniqueOrThrow({ where: { id } });

/** The hold ended without payment (the callback code ends it, as the gateway reports). */
async function expiredBooking(coupon = false) {
  const payment = await book({ coupon });
  await paymentCallback(client).useCase.execute(
    signed(callbackEvent(payment, { outcome: "SESSION_CLOSED" })),
  );
  return payment;
}

async function resale() {
  const rival = phoneOf(2);
  const result = await websiteBooking(client).execute(
    bookingBody(rival, await issueToken(client, rival)),
    "rival-booking-key",
  );
  if (!result.ok) throw new Error(result.error.code);
}

describe("expire-holds (AC-4)", () => {
  it("ends an overdue hold once: units and coupon released, held rows kept, notice queued", async () => {
    const payment = await book({ coupon: true });
    const early = paymentJobs(client, inJob(14));
    expect(await early.expire.run()).toEqual({
      expired: 0,
      skipped: 0,
      failed: 0,
    });
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "AWAITING_PAYMENT",
    });

    const job = paymentJobs(client, inJob(16));
    expect(await job.expire.run()).toEqual({
      expired: 1,
      skipped: 0,
      failed: 0,
    });
    const reservation = await reservationOf(payment.reservationId);
    expect(reservation).toMatchObject({
      status: "PAYMENT_FAILED",
      paymentStatus: "FAILED",
      holdExpiresAt: null,
      rooms: [{ consumesInventory: false }],
      redemption: { releasedAt: after(16) },
    });
    expect(await paymentOf(payment.id)).toMatchObject({ status: "EXPIRED" });
    expect(
      reservation.notifications.filter((row) => row.status === "HELD"),
    ).toHaveLength(3);
    expect(
      reservation.notifications.filter(
        (row) =>
          row.kind === "reservation.payment-not-completed" &&
          row.status === "PENDING",
      ),
    ).toHaveLength(2);
    expect(
      reservation.notifications.filter(
        (row) =>
          row.kind === "reservation.confirmed" && row.status === "PENDING",
      ),
    ).toHaveLength(0);
    expect(
      await client.auditEvent.count({
        where: { action: "payment.expired", entityId: payment.id },
      }),
    ).toBe(1);

    // Idempotent: nothing is left to do.
    expect(await job.expire.run()).toEqual({
      expired: 0,
      skipped: 0,
      failed: 0,
    });
    expect(
      await client.auditEvent.count({ where: { action: "payment.expired" } }),
    ).toBe(1);
  });

  it("leaves a confirmed booking alone", async () => {
    const payment = await book();
    await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment)),
    );
    expect(await paymentJobs(client, inJob(16)).expire.run()).toEqual({
      expired: 0,
      skipped: 0,
      failed: 0,
    });
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "CONFIRMED",
    });
  });

  it("counts a failing booking and still expires the others", async () => {
    const payment = await book();
    // Break the invariant for one booking: no initiated payment.
    await client.payment.update({
      where: { id: payment.id },
      data: { status: "EXPIRED" },
    });
    const job = paymentJobs(client, inJob(16));
    expect(await job.expire.run()).toEqual({
      expired: 0,
      skipped: 0,
      failed: 1,
    });
  });

  it("two parallel runs expire the booking once", async () => {
    const payment = await book();
    await withIndependentClients(2, async (clients) => {
      const summaries = await Promise.all(
        clients.map((connection) =>
          paymentJobs(connection, inJob(16)).expire.run(),
        ),
      );
      expect(summaries.reduce((sum, row) => sum + row.expired, 0)).toBe(1);
    });
    expect(
      await client.auditEvent.count({ where: { action: "payment.expired" } }),
    ).toBe(1);
    expect(
      await client.notificationOutbox.count({
        where: {
          reservationId: payment.reservationId,
          kind: "reservation.payment-not-completed",
        },
      }),
    ).toBe(2);
  });
});

describe("expire-holds racing a success and a resale (AC-5, C-14), 20 rounds", () => {
  const rounds = Array.from({ length: 20 }, (_, round) => round);
  const consuming = () =>
    client.reservationRoom.count({ where: { consumesInventory: true } });

  const pauseOn = (action: string) => {
    const paused = pausedAudit();
    const audit = (inner: Parameters<typeof paused.audit>[0]) => ({
      append: (event: Parameters<typeof inner.append>[0]) =>
        event.action === action
          ? paused.audit(inner).append(event)
          : inner.append(event),
    });
    return { paused, audit };
  };

  it("confirms through the late path when the job holds the lock first", async () => {
    await withIndependentClients(2, async ([first, second]) => {
      for (const round of rounds) {
        if (round > 0) await resetDatabase(client);
        const payment = await book();
        const { paused, audit } = pauseOn("payment.expired");
        const job = paymentJobs(first!, { ...inJob(16), audit }).expire.run();
        expect(
          await Promise.race([
            paused.reached.then(() => true),
            job.then(() => false),
          ]),
        ).toBe(true);
        const callback = paymentCallback(second!, inJob(16)).useCase.execute(
          signed(callbackEvent(payment)),
        );
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          paused.release();
          await Promise.allSettled([job, callback]);
        }
        expect(await job).toMatchObject({ expired: 1 });
        expect(await callback).toMatchObject({ ok: true });
        expect(await consuming()).toBe(1);
        expect(await reservationOf(payment.reservationId)).toMatchObject({
          status: "CONFIRMED",
          paymentStatus: "PAID",
        });
        expect(await paymentOf(payment.id)).toMatchObject({
          status: "SUCCEEDED",
        });
      }
    });
  });

  it("skips the booking when the success holds the lock first", async () => {
    await withIndependentClients(2, async ([first, second]) => {
      for (const round of rounds) {
        if (round > 0) await resetDatabase(client);
        const payment = await book();
        const { paused, audit } = pauseOn("payment.succeeded");
        const callback = paymentCallback(first!, {
          ...inJob(14),
          audit,
        }).useCase.execute(signed(callbackEvent(payment)));
        expect(
          await Promise.race([
            paused.reached.then(() => true),
            callback.then(() => false),
          ]),
        ).toBe(true);
        // The job reads the hold as overdue, then waits for the reservation lock.
        const job = paymentJobs(second!, inJob(16)).expire.run();
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          paused.release();
          await Promise.allSettled([job, callback]);
        }
        expect(await callback).toMatchObject({ ok: true });
        expect(await job).toEqual({ expired: 0, skipped: 1, failed: 0 });
        expect(await consuming()).toBe(1);
        expect(await reservationOf(payment.reservationId)).toMatchObject({
          status: "CONFIRMED",
        });
      }
    });
  });

  it("lets a rival book the unit once, whichever of the job and the booking expires the hold", async () => {
    await withIndependentClients(2, async ([first, second]) => {
      for (const round of rounds) {
        if (round > 0) await resetDatabase(client);
        const payment = await book();
        const rival = phoneOf(2);
        const body = bookingBody(rival, await issueToken(client, rival));
        const { paused, audit } = pauseOn("payment.expired");
        const job = paymentJobs(first!, { ...inJob(16), audit }).expire.run();
        expect(
          await Promise.race([
            paused.reached.then(() => true),
            job.then(() => false),
          ]),
        ).toBe(true);
        const booking = websiteBooking(second!, inJob(16)).execute(
          body,
          "rival-booking-key",
        );
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          paused.release();
          await Promise.allSettled([job, booking]);
        }
        expect(await job).toMatchObject({ expired: 1 });
        expect(await booking).toMatchObject({ ok: true });
        expect(await consuming()).toBe(1);
        expect(await reservationOf(payment.reservationId)).toMatchObject({
          status: "PAYMENT_FAILED",
        });
        expect(
          await client.auditEvent.count({
            where: { action: "payment.expired" },
          }),
        ).toBe(1);
      }
    });
  });
});

describe("expiry and cleanup races, second lock order (AC-5, C-14), 20 rounds", () => {
  const rounds = Array.from({ length: 20 }, (_, round) => round);
  const consuming = () =>
    client.reservationRoom.count({ where: { consumesInventory: true } });

  const pauseOn = (action: string) => {
    const paused = pausedAudit();
    const audit = (inner: Parameters<typeof paused.audit>[0]) => ({
      append: (event: Parameters<typeof inner.append>[0]) =>
        event.action === action
          ? paused.audit(inner).append(event)
          : inner.append(event),
    });
    return { paused, audit };
  };

  it("skips the booking when a rival booking already expired the hold and holds the lock", async () => {
    await withIndependentClients(2, async ([first, second]) => {
      for (const round of rounds) {
        if (round > 0) await resetDatabase(client);
        const payment = await book();
        const rival = phoneOf(2);
        const body = bookingBody(rival, await issueToken(client, rival));
        const { paused, audit } = pauseOn("reservation.created");
        const booking = websiteBooking(first!, {
          ...inJob(16),
          audit,
        }).execute(body, "rival-booking-key");
        expect(
          await Promise.race([
            paused.reached.then(() => true),
            booking.then(() => false),
          ]),
        ).toBe(true);
        // The job reads the hold as overdue, then waits on the rival's lock.
        const job = paymentJobs(second!, inJob(16)).expire.run();
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          paused.release();
          await Promise.allSettled([job, booking]);
        }
        expect(await booking).toMatchObject({ ok: true });
        expect(await job).toEqual({ expired: 0, skipped: 1, failed: 0 });
        expect(await consuming()).toBe(1);
        expect(await reservationOf(payment.reservationId)).toMatchObject({
          status: "PAYMENT_FAILED",
        });
        expect(
          await client.auditEvent.count({
            where: { action: "payment.expired" },
          }),
        ).toBe(1);
      }
    });
  });

  it("keeps the released messages when a late success holds the lock before the cleanup", async () => {
    await withIndependentClients(2, async ([first, second]) => {
      for (const round of rounds) {
        if (round > 0) await resetDatabase(client);
        const payment = await expiredBooking();
        const { paused, audit } = pauseOn("payment.succeeded");
        const callback = paymentCallback(first!, {
          ...inJob(50),
          audit,
        }).useCase.execute(signed(callbackEvent(payment)));
        expect(
          await Promise.race([
            paused.reached.then(() => true),
            callback.then(() => false),
          ]),
        ).toBe(true);
        // Past the grace period "not found" means no success, so the job tries to delete.
        const job = paymentJobs(second!, inJob(50)).reconcile.run();
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          paused.release();
          await Promise.allSettled([job, callback]);
        }
        expect(await callback).toMatchObject({ ok: true });
        expect(await job).toMatchObject({ heldDeleted: 0, pending: 1 });
        const reservation = await reservationOf(payment.reservationId);
        expect(reservation).toMatchObject({ status: "CONFIRMED" });
        expect(
          reservation.notifications.filter(
            (row) =>
              row.kind === "reservation.confirmed" && row.status === "PENDING",
          ),
        ).toHaveLength(2);
        expect(
          reservation.notifications.filter((row) => row.status === "HELD"),
        ).toHaveLength(0);
      }
    });
  });
});

describe("job overlap guard", () => {
  it("skips a run while the same job is running and runs again afterwards", async () => {
    await withIndependentClients(2, async ([holder, runner]) => {
      await holder!.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PAYMENT_JOB_LOCK_KEYS["expire-holds"]}::bigint)`;
        expect(await runPaymentJobOn(runner!, "expire-holds")).toEqual({
          skipped: "ALREADY_RUNNING",
        });
        // The other job has its own key.
        expect(
          await runPaymentJobOn(runner!, "reconcile-payments"),
        ).toHaveProperty("gatewayReady");
      });
      expect(await runPaymentJobOn(runner!, "expire-holds")).toEqual({
        expired: 0,
        skipped: 0,
        failed: 0,
      });
    });
  });
});

describe("reconcile-payments: lost callbacks", () => {
  it("confirms a booking whose success callback was lost, through the callback code", async () => {
    const payment = await book();
    const event = callbackEvent(payment);
    const job = paymentJobs(client, {
      ...inJob(14),
      getTransaction: async () => event,
    });
    expect(await job.reconcile.run()).toMatchObject({
      gatewayReady: true,
      answered: 1,
      failed: 0,
    });
    expect(job.getTransaction).toHaveBeenCalledWith({
      paymentId: payment.id,
      providerOrderId: "order-1",
    });
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
    });
    expect(
      await client.paymentEvent.count({
        where: { providerEventId: event.providerEventId, result: "APPLIED" },
      }),
    ).toBe(1);

    // The same answer again, or the callback arriving late, changes nothing.
    expect(await job.reconcile.run()).toMatchObject({ answered: 0 });
    await paymentCallback(client).useCase.execute(signed(event));
    expect(
      await client.auditEvent.count({ where: { action: "payment.succeeded" } }),
    ).toBe(1);
  });

  it("ends the hold when the gateway reports the session closed", async () => {
    const payment = await book();
    const job = paymentJobs(client, {
      ...inJob(14),
      getTransaction: async () =>
        callbackEvent(payment, { outcome: "SESSION_CLOSED" }),
    });
    expect(await job.reconcile.run()).toMatchObject({ answered: 1 });
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "PAYMENT_FAILED",
    });
    expect(await paymentOf(payment.id)).toMatchObject({ status: "EXPIRED" });
  });

  it("does nothing while the gateway has no answer or fails", async () => {
    const payment = await book();
    const quiet = paymentJobs(client, inJob(14));
    expect(await quiet.reconcile.run()).toMatchObject({
      answered: 0,
      pending: 1,
    });
    const broken = paymentJobs(client, {
      ...inJob(14),
      getTransaction: async () => {
        throw new Error("network");
      },
    });
    expect(await broken.reconcile.run()).toMatchObject({
      answered: 0,
      failed: 1,
    });
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "AWAITING_PAYMENT",
    });
    expect(await paymentOf(payment.id)).toMatchObject({ status: "INITIATED" });
  });

  it("ignores an answer about another payment", async () => {
    const payment = await book();
    const job = paymentJobs(client, {
      ...inJob(14),
      getTransaction: async () =>
        callbackEvent(payment, { paymentId: "another-payment" }),
    });
    expect(await job.reconcile.run()).toMatchObject({
      answered: 0,
      pending: 1,
    });
    expect(await client.paymentEvent.count()).toBe(0);
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "AWAITING_PAYMENT",
    });
  });

  it("two parallel runs apply one lost success once", async () => {
    const payment = await book();
    const event = callbackEvent(payment);
    await withIndependentClients(2, async (clients) => {
      const summaries = await Promise.all(
        clients.map((connection) =>
          paymentJobs(connection, {
            ...inJob(14),
            getTransaction: async () => event,
          }).reconcile.run(),
        ),
      );
      expect(summaries.every((summary) => summary.failed === 0)).toBe(true);
    });
    expect(
      await client.auditEvent.count({ where: { action: "payment.succeeded" } }),
    ).toBe(1);
    expect(
      await client.paymentEvent.count({
        where: { providerEventId: event.providerEventId, result: "APPLIED" },
      }),
    ).toBe(1);
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "CONFIRMED",
      version: payment.reservation.version + 1,
    });
  });

  it("refunds automatically when a recovered success finds the unit resold", async () => {
    const payment = await expiredBooking();
    await resale();
    const event = callbackEvent(payment);
    const job = paymentJobs(client, {
      ...inJob(16),
      getTransaction: async () => event,
    });
    expect(await job.reconcile.run()).toMatchObject({
      answered: 1,
      refundsSent: 0,
      failed: 0,
    });
    expect(job.refund).toHaveBeenCalledTimes(1);
    expect(job.refund).toHaveBeenCalledWith({
      paymentId: payment.id,
      providerTransactionId: event.providerTransactionId,
      amountMinor: payment.amountMinor,
      currency: "USD",
      idempotencyKey: `${payment.id}:refund:1`,
    });
    expect(await paymentOf(payment.id)).toMatchObject({
      status: "REFUND_PENDING",
      refundRequestedAt: after(16),
    });
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "PAYMENT_FAILED",
      paymentStatus: "REFUND_PENDING",
    });
  });

  it("does not ask before the session ended or about another provider", async () => {
    const payment = await book();
    const early = paymentJobs(client, inJob(5));
    await early.reconcile.run();
    expect(early.getTransaction).not.toHaveBeenCalled();
    await client.payment.update({
      where: { id: payment.id },
      data: { provider: "other-gateway" },
    });
    const other = paymentJobs(client, inJob(14));
    await other.reconcile.run();
    expect(other.getTransaction).not.toHaveBeenCalled();
  });

  it("asks nothing and changes nothing without a gateway", async () => {
    await book();
    const job = paymentJobs(client, { ...inJob(14), noGateway: true });
    expect(await job.reconcile.run()).toEqual({
      gatewayReady: false,
      answered: 0,
      refundsSent: 0,
      heldDeleted: 0,
      pending: 0,
      failed: 0,
    });
    expect(job.getTransaction).not.toHaveBeenCalled();
  });

  it("recovers a success reported after the hold expired (late path)", async () => {
    const payment = await book();
    await paymentJobs(client, inJob(16)).expire.run();
    const event = callbackEvent(payment);
    const job = paymentJobs(client, {
      ...inJob(17),
      getTransaction: async () => event,
    });
    // The held rows make the expired payment a candidate for the check.
    expect(await job.reconcile.run()).toMatchObject({
      answered: 1,
      heldDeleted: 0,
    });
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
    });
    expect(
      (await reservationOf(payment.reservationId)).notifications.filter(
        (row) => row.status === "HELD",
      ),
    ).toHaveLength(0);
  });
});

describe("reconcile-payments: unsent refunds (T5 follow-up)", () => {
  /** A late success after resale, whose refund call failed: unsent and pending. */
  async function unsentRefund(withTransactionId = true) {
    const payment = await expiredBooking();
    await resale();
    const full = callbackEvent(payment);
    // An event with no transaction id, as a gateway that omitted it would send.
    const bare = Object.fromEntries(
      Object.entries(full).filter(([key]) => key !== "providerTransactionId"),
    ) as typeof full;
    const event = withTransactionId ? full : bare;
    await paymentCallback(client, {
      refund: async () => {
        throw new Error("network");
      },
    }).useCase.execute(signed(event));
    expect(await paymentOf(payment.id)).toMatchObject({
      status: "REFUND_PENDING",
      refundRequestedAt: null,
    });
    return { payment, event };
  }

  it("sends it once with the original key and stamps it only after the call", async () => {
    const { payment, event } = await unsentRefund();
    // Younger than two minutes: left alone.
    const young = paymentJobs(client, inJob(1));
    expect(await young.reconcile.run()).toMatchObject({ refundsSent: 0 });
    expect(young.refund).not.toHaveBeenCalled();

    const job = paymentJobs(client, inJob(3));
    expect(await job.reconcile.run()).toMatchObject({ refundsSent: 1 });
    expect(job.refund).toHaveBeenCalledTimes(1);
    expect(job.refund).toHaveBeenCalledWith({
      paymentId: payment.id,
      providerTransactionId: event.providerTransactionId,
      amountMinor: payment.amountMinor,
      currency: "USD",
      idempotencyKey: `${payment.id}:refund:1`,
    });
    expect(await paymentOf(payment.id)).toMatchObject({
      status: "REFUND_PENDING",
      refundRequestedAt: after(3),
      refundProviderId: "refund-1",
    });
    expect(await job.reconcile.run()).toMatchObject({ refundsSent: 0 });
    expect(job.refund).toHaveBeenCalledTimes(1);
  });

  it("stamps only the refund attempt it was given", async () => {
    const { payment } = await unsentRefund();
    const store = new PrismaBookingPaymentStore(client);
    await store.markRefundRequested(payment.id, after(3), "refund-9", 2);
    expect(await paymentOf(payment.id)).toMatchObject({
      refundRequestedAt: null,
      refundProviderId: null,
    });
    await store.markRefundRequested(payment.id, after(3), "refund-9", 1);
    expect(await paymentOf(payment.id)).toMatchObject({
      refundRequestedAt: after(3),
      refundProviderId: "refund-9",
    });
  });

  it("leaves it unsent for the next run when the call fails", async () => {
    const { payment } = await unsentRefund();
    const job = paymentJobs(client, {
      ...inJob(3),
      refund: async () => {
        throw new Error("network");
      },
    });
    expect(await job.reconcile.run()).toMatchObject({
      refundsSent: 0,
      failed: 1,
    });
    expect(await paymentOf(payment.id)).toMatchObject({
      refundRequestedAt: null,
    });
    const retry = paymentJobs(client, inJob(8));
    expect(await retry.reconcile.run()).toMatchObject({ refundsSent: 1 });
  });

  it("looks up a missing transaction id before refunding", async () => {
    const { payment } = await unsentRefund(false);
    expect(await paymentOf(payment.id)).toMatchObject({
      providerTransactionId: null,
    });
    const job = paymentJobs(client, {
      ...inJob(3),
      getTransaction: async () =>
        callbackEvent(payment, { providerTransactionId: "gateway-tx-9" }),
    });
    expect(await job.reconcile.run()).toMatchObject({ refundsSent: 1 });
    expect(job.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTransactionId: "gateway-tx-9",
        idempotencyKey: `${payment.id}:refund:1`,
      }),
    );
    expect(await paymentOf(payment.id)).toMatchObject({
      providerTransactionId: "gateway-tx-9",
    });
  });

  it("does not refund while the gateway cannot confirm the transaction", async () => {
    const { payment } = await unsentRefund(false);
    for (const answer of [
      "NOT_FOUND" as const,
      callbackEvent(payment, { amountMinor: 1 }),
      callbackEvent(payment, { outcome: "DECLINED" }),
    ]) {
      const job = paymentJobs(client, {
        ...inJob(3),
        getTransaction: async () => answer,
      });
      expect(await job.reconcile.run()).toMatchObject({
        refundsSent: 0,
        pending: 1,
      });
      expect(job.refund).not.toHaveBeenCalled();
    }
    expect(await paymentOf(payment.id)).toMatchObject({
      providerTransactionId: null,
      refundRequestedAt: null,
    });
  });
});

describe("reconcile-payments: held confirmations", () => {
  const held = (reservationId: string) =>
    client.notificationOutbox.count({
      where: { reservationId, status: "HELD" },
    });

  it("keeps them until the gateway reports no success after the grace period, then deletes them", async () => {
    const payment = await expiredBooking();
    expect(await held(payment.reservationId)).toBe(3);

    const unsure = paymentJobs(client, {
      ...inJob(16),
      getTransaction: async () => {
        throw new Error("network");
      },
    });
    expect(await unsure.reconcile.run()).toMatchObject({
      heldDeleted: 0,
      failed: 1,
    });
    expect(await held(payment.reservationId)).toBe(3);

    const closed = async () =>
      callbackEvent(payment, { outcome: "SESSION_CLOSED" });
    // The session deadline was at 13 minutes: inside the 30 minute grace the rows stay.
    const early = paymentJobs(client, {
      ...inJob(16),
      getTransaction: closed,
    });
    expect(await early.reconcile.run()).toMatchObject({
      heldDeleted: 0,
      pending: 1,
    });
    expect(await held(payment.reservationId)).toBe(3);

    const job = paymentJobs(client, { ...inJob(45), getTransaction: closed });
    expect(await job.reconcile.run()).toMatchObject({ heldDeleted: 1 });
    expect(await held(payment.reservationId)).toBe(0);
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "PAYMENT_FAILED",
    });
  });

  it("confirms a payment that was still settling when an early lookup found nothing", async () => {
    const payment = await expiredBooking();
    const early = paymentJobs(client, inJob(16)); // "not found"
    expect(await early.reconcile.run()).toMatchObject({
      heldDeleted: 0,
      pending: 1,
    });
    expect(await held(payment.reservationId)).toBe(3);
    const later = paymentJobs(client, {
      ...inJob(20),
      getTransaction: async () => callbackEvent(payment),
    });
    expect(await later.reconcile.run()).toMatchObject({
      answered: 1,
      heldDeleted: 0,
    });
    const reservation = await reservationOf(payment.reservationId);
    expect(reservation).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
    });
    expect(
      reservation.notifications.filter(
        (row) =>
          row.kind === "reservation.confirmed" && row.status === "PENDING",
      ),
    ).toHaveLength(2);
  });

  it("ignores an answer about another payment", async () => {
    const payment = await expiredBooking();
    const job = paymentJobs(client, {
      ...inJob(45),
      getTransaction: async () =>
        callbackEvent(payment, { paymentId: "another-payment" }),
    });
    expect(await job.reconcile.run()).toMatchObject({
      heldDeleted: 0,
      pending: 1,
    });
    expect(await held(payment.reservationId)).toBe(3);
  });

  it("deletes them when the gateway has no record after the grace period", async () => {
    const payment = await expiredBooking();
    const job = paymentJobs(client, inJob(45));
    expect(await job.reconcile.run()).toMatchObject({ heldDeleted: 1 });
    expect(await held(payment.reservationId)).toBe(0);
  });

  it("applies a success the gateway reports instead of deleting", async () => {
    const payment = await expiredBooking();
    const job = paymentJobs(client, {
      ...inJob(16),
      getTransaction: async () => callbackEvent(payment),
    });
    expect(await job.reconcile.run()).toMatchObject({
      answered: 1,
      heldDeleted: 0,
    });
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "CONFIRMED",
    });
  });

  it("keeps them on an answer that is not about the transaction", async () => {
    const payment = await expiredBooking();
    const job = paymentJobs(client, {
      ...inJob(16),
      getTransaction: async () =>
        callbackEvent(payment, {
          kind: "REFUND",
          outcome: "REFUND_FAILED",
          refundAttemptKey: `${payment.id}:refund:1`,
        }),
    });
    expect(await job.reconcile.run()).toMatchObject({
      heldDeleted: 0,
      pending: 1,
    });
    expect(await held(payment.reservationId)).toBe(3);
  });

  it("deletes them 24 hours after the hold ended without asking the gateway", async () => {
    const payment = await expiredBooking();
    // Inside the 24 hours a failing gateway keeps them.
    const early = paymentJobs(client, {
      ...inJob(23 * 60),
      getTransaction: async () => {
        throw new Error("network");
      },
    });
    expect(await early.reconcile.run()).toMatchObject({
      heldDeleted: 0,
      failed: 1,
    });
    expect(await held(payment.reservationId)).toBe(3);
    const throwing = paymentJobs(client, {
      ...inJob(25 * 60),
      getTransaction: async () => {
        throw new Error("network");
      },
    });
    expect(await throwing.reconcile.run()).toMatchObject({
      heldDeleted: 1,
      failed: 0,
    });
    expect(throwing.getTransaction).not.toHaveBeenCalled();
    expect(await held(payment.reservationId)).toBe(0);
  });

  it("never touches a confirmed booking's messages", async () => {
    const payment = await book();
    await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment)),
    );
    const job = paymentJobs(client, inJob(25 * 60));
    expect(await job.reconcile.run()).toMatchObject({ heldDeleted: 0 });
    expect(job.getTransaction).not.toHaveBeenCalled();
    expect(
      (await reservationOf(payment.reservationId)).notifications.filter(
        (row) => row.kind === "reservation.confirmed",
      ),
    ).toHaveLength(2);
  });
});

describe("logs", () => {
  it("write nothing, so no contact, token or payload can leak", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (name) => vi.spyOn(console, name).mockImplementation(() => {}),
    );
    try {
      const payment = await book();
      await paymentJobs(client, inJob(16)).expire.run();
      await paymentJobs(client, {
        ...inJob(16),
        getTransaction: async () => callbackEvent(payment),
      }).reconcile.run();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("npm run reservations", () => {
  const run = (command: string, extra: Record<string, string> = {}) =>
    spawnSync("npm", ["run", "--silent", "reservations", "--", command], {
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl().url,
        DIRECT_DATABASE_URL: testDatabaseUrl().url,
        ...extra,
      },
      encoding: "utf8",
    });

  it("runs expire-holds and reports counts only", async () => {
    const payment = await book();
    await client.reservation.update({
      where: { id: payment.reservationId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    const { status, stdout, stderr } = run("expire-holds");
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ expired: 1, skipped: 0, failed: 0 });
    expect(await reservationOf(payment.reservationId)).toMatchObject({
      status: "PAYMENT_FAILED",
    });
  });

  it("runs reconcile-payments and reports whether a gateway is ready", () => {
    const { status, stdout, stderr } = run("reconcile-payments", {
      PAYMENT_PROVIDER: "fake",
    });
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      gatewayReady: true,
      answered: 0,
      refundsSent: 0,
      heldDeleted: 0,
      pending: 0,
      failed: 0,
    });
  });

  it("refuses an unknown command", () => {
    const { status, stderr } = run("expire-everything");
    expect(status).toBe(2);
    expect(stderr).toContain("expire-holds | reconcile-payments");
  });
});
