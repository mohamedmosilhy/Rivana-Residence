import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth";
import { staffReservationCommands } from "@/composition/reservations";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import type { CheckoutResult, RefundResult } from "@/application/payments";

import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { withIndependentClients } from "./support/concurrency";
import {
  callbackEvent,
  paymentJobs,
  PROVIDER,
  refundCommands,
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

const principals = vi.hoisted(() => new Map<string, StaffPrincipal>());
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async (headers: Headers) =>
    principals.get(headers.get("x-test-staff") ?? "") ?? null,
  throttleKeys: () => new HmacThrottleKeys("test-refund-hmac"),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
const { GET: listRoute } = await import(
  "@/app/api/v1/staff/cancellation-requests/route"
);
const { POST: approveRoute } = await import(
  "@/app/api/v1/staff/cancellation-requests/[id]/approval/route"
);
const { POST: rejectRoute } = await import(
  "@/app/api/v1/staff/cancellation-requests/[id]/rejection/route"
);
const { GET: paymentsRoute } = await import(
  "@/app/api/v1/staff/reservations/[id]/payments/route"
);
const { POST: retryRoute } = await import(
  "@/app/api/v1/staff/payments/[id]/refund-retry/route"
);
const { POST: cancelRoute } = await import(
  "@/app/api/v1/staff/reservations/[id]/cancellation/route"
);

// M9-T8: S9 paid path, S17 to S19, S44, S45, CompleteRefund through the call,
// the callback and the reconcile lookup, on real PostgreSQL.

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
const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Administrator",
  email: "admin@example.test",
  role: "ADMIN",
  branchIds: [],
  sessionId: "staff-session",
};
const manager: StaffPrincipal = {
  ...admin,
  role: "MANAGER",
  branchIds: [TEST_BRANCH_ID],
};
const succeeded: RefundResult = {
  status: "SUCCEEDED",
  providerRefundId: "r-1",
};
const failed: RefundResult = { status: "FAILED" };
const pending: RefundResult = { status: "PENDING", providerRefundId: "r-1" };

async function reset() {
  seeded = false;
  await resetDatabase(client);
  await createActor(client);
}
beforeEach(reset);
afterAll(() => client.$disconnect());

let counter = 0;
let seeded = false;
/** A confirmed booking, paid online (`paid`) or pay at the hotel, with an OPEN guest request. */
async function confirmed(
  options: { paid: boolean; request?: boolean; phone?: number } = {
    paid: true,
  },
) {
  counter += 1;
  const phone = phoneOf(options.phone ?? 1);
  if (!(await client.branch.findFirst({ where: { id: TEST_BRANCH_ID } })))
    throw new Error("branch");
  if (!seeded) {
    seeded = true;
    await seedBookable(client, { units: 3 });
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { onlinePaymentEnabled: true },
    });
  }
  const body = bookingBody(phone, await issueToken(client, phone), {
    paymentMethod: options.paid ? "ONLINE" : "PAY_AT_HOTEL",
  });
  const created = await websiteBooking(
    client,
    options.paid ? { checkout: connection } : {},
  ).execute(body, `refund-booking-key-${counter}`);
  if (!created.ok) throw new Error(created.error.code);
  const reservation = await client.reservation.findFirstOrThrow({
    where: { guestPhone: phone },
  });
  let transactionId: string | null = null;
  if (options.paid) {
    const payment = await client.payment.findFirstOrThrow({
      where: { reservationId: reservation.id },
    });
    const event = callbackEvent(payment);
    transactionId = event.providerTransactionId ?? null;
    const { useCase } = refundCommands(client);
    const done = await useCase.execute(signed(event));
    if (!done.ok) throw new Error(done.error.code);
  }
  let requestId: string | null = null;
  if (options.request !== false) {
    requestId = `request-${counter}`;
    await client.cancellationRequest.create({
      data: {
        id: requestId,
        reservationId: reservation.id,
        requestedBy: "GUEST",
        status: "OPEN",
        createdAt: NOW,
      },
    });
  }
  return { reservationId: reservation.id, requestId, transactionId };
}

const state = async (reservationId: string) => ({
  reservation: await client.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { rooms: true },
  }),
  payment: await client.payment.findFirst({ where: { reservationId } }),
  requests: await client.cancellationRequest.findMany({
    where: { reservationId },
    orderBy: { createdAt: "asc" },
  }),
  kinds: (
    await client.notificationOutbox.findMany({ where: { reservationId } })
  ).map((row) => `${row.kind}:${row.channel}`),
});

describe("S19 rejection", () => {
  it("keeps the booking confirmed and messages the reason", async () => {
    const { reservationId, requestId } = await confirmed({ paid: false });
    const { decide } = refundCommands(client);
    const result = await decide.reject(manager, requestId!, {
      reason: "Rooms are needed for a group",
    });
    expect(result).toMatchObject({ ok: true, value: { status: "REJECTED" } });
    const after = await state(reservationId);
    expect(after.reservation.status).toBe("CONFIRMED");
    expect(after.requests[0]).toMatchObject({
      status: "REJECTED",
      decisionReason: "Rooms are needed for a group",
      decidedById: admin.id,
    });
    expect(after.kinds).toEqual(
      expect.arrayContaining([
        "cancellation-request.rejected:EMAIL",
        "cancellation-request.rejected:WHATSAPP",
      ]),
    );
    expect(
      await client.auditEvent.count({
        where: { action: "cancellation-request.rejected" },
      }),
    ).toBe(1);
    // A second decision is refused and changes nothing.
    expect(await decide.approve(manager, requestId!, {})).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION" },
    });
    expect(
      await decide.reject(manager, requestId!, { reason: "again" }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });

  it("needs a reason", async () => {
    const { requestId } = await confirmed({ paid: false });
    const { decide } = refundCommands(client);
    expect(
      await decide.reject(manager, requestId!, { reason: "  " }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
});

describe("S18 approval of an unpaid booking", () => {
  it("cancels at once, releases the inventory, completes the request", async () => {
    const { reservationId, requestId } = await confirmed({ paid: false });
    const { decide, refund } = refundCommands(client);
    const result = await decide.approve(manager, requestId!, {
      note: "Guest called",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { status: "COMPLETED", refundStarted: false },
    });
    const after = await state(reservationId);
    expect(after.reservation.status).toBe("CANCELLED");
    expect(after.reservation.rooms.every((row) => !row.consumesInventory)).toBe(
      true,
    );
    expect(after.requests[0]?.status).toBe("COMPLETED");
    expect(after.kinds).toContain("cancellation-request.approved:EMAIL");
    expect(refund).not.toHaveBeenCalled();
    expect(
      await client.auditEvent.count({
        where: { action: "cancellation-request.approved" },
      }),
    ).toBe(1);
  });
});

describe("S18 approval of a paid booking and CompleteRefund", () => {
  it("cancels only after the gateway answers success at once", async () => {
    const { reservationId, requestId, transactionId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(succeeded);
    const result = await commands.decide.approve(manager, requestId!, {});
    expect(result).toMatchObject({
      ok: true,
      value: { status: "COMPLETED", refundStarted: true },
    });
    const after = await state(reservationId);
    expect(after.reservation).toMatchObject({
      status: "CANCELLED",
      paymentStatus: "REFUNDED",
    });
    expect(after.payment).toMatchObject({
      status: "REFUNDED",
      refundAttempt: 1,
    });
    expect(after.payment?.refundedAt).not.toBeNull();
    expect(after.kinds).toEqual(
      expect.arrayContaining([
        "cancellation-request.approved:EMAIL",
        "payment.refunded:EMAIL",
        "payment.refunded:WHATSAPP",
      ]),
    );
    expect(commands.refund).toHaveBeenCalledTimes(1);
    expect(commands.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTransactionId: transactionId,
        idempotencyKey: `${after.payment!.id}:refund:1`,
        amountMinor: after.payment!.amountMinor,
      }),
    );
    for (const action of [
      "payment.refund-requested",
      "payment.refunded",
      "reservation.cancelled",
      "cancellation-request.completed",
    ])
      expect(await client.auditEvent.count({ where: { action } })).toBe(1);
  });

  it("waits while the gateway is pending and finishes on the refund callback once", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(pending);
    const result = await commands.decide.approve(manager, requestId!, {});
    expect(result).toMatchObject({
      ok: true,
      value: { status: "REFUND_PENDING", refundStarted: true },
    });
    let after = await state(reservationId);
    expect(after.reservation).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "REFUND_PENDING",
    });
    expect(after.payment?.status).toBe("REFUND_PENDING");
    expect(after.payment?.refundRequestedAt).not.toBeNull();

    const payment = after.payment!;
    const stale = callbackEvent(payment, {
      kind: "REFUND",
      outcome: "REFUND_FAILED",
      refundAttemptKey: `${payment.id}:refund:0`,
    } as never);
    expect(await commands.useCase.execute(signed(stale))).toMatchObject({
      ok: true,
    });
    // An older attempt's answer is acknowledged and ignored.
    expect((await state(reservationId)).payment?.status).toBe("REFUND_PENDING");
    expect(
      await client.paymentEvent.findUnique({
        where: { providerEventId: stale.providerEventId },
      }),
    ).toMatchObject({ result: "IGNORED_STATE" });

    const done = callbackEvent(payment, {
      kind: "REFUND",
      outcome: "REFUND_SUCCEEDED",
      refundAttemptKey: `${payment.id}:refund:1`,
    } as never);
    for (let delivery = 0; delivery < 2; delivery += 1)
      expect(await commands.useCase.execute(signed(done))).toMatchObject({
        ok: true,
      });
    after = await state(reservationId);
    expect(after.reservation.status).toBe("CANCELLED");
    expect(after.payment?.status).toBe("REFUNDED");
    expect(after.requests[0]?.status).toBe("COMPLETED");
    expect(
      await client.auditEvent.count({ where: { action: "payment.refunded" } }),
    ).toBe(1);
    expect(
      after.kinds.filter((kind) => kind === "payment.refunded:EMAIL"),
    ).toHaveLength(1);
  });

  it("rejects a refund result with another amount (mismatch) without changes", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(pending);
    await commands.decide.approve(manager, requestId!, {});
    const payment = (await state(reservationId)).payment!;
    const event = callbackEvent(payment, {
      kind: "REFUND",
      outcome: "REFUND_SUCCEEDED",
      refundAttemptKey: `${payment.id}:refund:1`,
      amountMinor: payment.amountMinor - 1,
    } as never);
    await commands.useCase.execute(signed(event));
    expect((await state(reservationId)).payment?.status).toBe("REFUND_PENDING");
    expect(
      await client.paymentEvent.findUnique({
        where: { providerEventId: event.providerEventId },
      }),
    ).toMatchObject({ result: "IGNORED_MISMATCH" });
  });

  it("shows a failure, alerts the branch, keeps the booking, and a retry uses a new key", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(failed);
    const result = await commands.decide.approve(manager, requestId!, {});
    expect(result).toMatchObject({
      ok: true,
      value: { status: "REFUND_FAILED" },
    });
    let after = await state(reservationId);
    expect(after.reservation).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
    });
    expect(after.payment?.status).toBe("REFUND_FAILED");
    expect(after.kinds).toContain("refund.staff-alert:EMAIL");
    const paymentId = after.payment!.id;

    // Only a failed refund can be retried.
    commands.refund.mockResolvedValueOnce(succeeded);
    expect(await commands.retry.execute(manager, paymentId)).toMatchObject({
      ok: true,
      value: { status: "REFUNDED" },
    });
    expect(commands.refund).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: `${paymentId}:refund:2` }),
    );
    after = await state(reservationId);
    expect(after.reservation.status).toBe("CANCELLED");
    expect(after.requests[0]?.status).toBe("COMPLETED");
    expect(await commands.retry.execute(manager, paymentId)).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION" },
    });
    expect(commands.refund).toHaveBeenCalledTimes(2);
  });

  it("leaves an unsent refund for the sweep when the call throws, then sends the same key", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockRejectedValueOnce(new Error("network"));
    const result = await commands.decide.approve(manager, requestId!, {});
    expect(result).toMatchObject({
      ok: true,
      value: { status: "REFUND_PENDING" },
    });
    const before = (await state(reservationId)).payment!;
    expect(before).toMatchObject({
      status: "REFUND_PENDING",
      refundRequestedAt: null,
    });

    const later = () => new Date(NOW.getTime() + 3 * 60_000);
    const jobs = paymentJobs(client, {
      now: later,
      refund: async () => succeeded,
    });
    expect(await jobs.reconcile.run()).toMatchObject({ refundsSent: 1 });
    expect(jobs.refund).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `${before.id}:refund:1` }),
    );
    const after = await state(reservationId);
    expect(after.payment?.status).toBe("REFUNDED");
    expect(after.reservation.status).toBe("CANCELLED");
  });

  it("looks up a refund that was sent and never answered", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(pending);
    await commands.decide.approve(manager, requestId!, {});
    const payment = (await state(reservationId)).payment!;
    const answer = callbackEvent(payment, {
      kind: "REFUND",
      outcome: "REFUND_SUCCEEDED",
      refundAttemptKey: `${payment.id}:refund:1`,
    } as never);
    const early = paymentJobs(client, {
      now: () => new Date(NOW.getTime() + 5 * 60_000),
      getTransaction: async () => answer,
    });
    // Sent less than 10 minutes ago: not asked yet.
    await early.reconcile.run();
    expect(early.getTransaction).not.toHaveBeenCalled();
    const late = paymentJobs(client, {
      now: () => new Date(NOW.getTime() + 11 * 60_000),
      getTransaction: async () => answer,
    });
    expect(await late.reconcile.run()).toMatchObject({ answered: 1 });
    expect((await state(reservationId)).reservation.status).toBe("CANCELLED");
    // Asking again finds nothing pending.
    expect(await late.reconcile.run()).toMatchObject({ answered: 0 });
  });

  it("runs CompleteRefund twice without a second effect", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(pending);
    await commands.decide.approve(manager, requestId!, {});
    const payment = (await state(reservationId)).payment!;
    const outcome = {
      paymentId: payment.id,
      attemptKey: `${payment.id}:refund:1`,
      outcome: "SUCCEEDED" as const,
    };
    expect(await commands.complete.execute(outcome)).toMatchObject({
      ok: true,
      value: { applied: true },
    });
    expect(await commands.complete.execute(outcome)).toMatchObject({
      ok: true,
      value: { applied: false },
    });
    expect(
      await client.auditEvent.count({ where: { action: "payment.refunded" } }),
    ).toBe(1);
  });
});

describe("S9 paid staff cancellation (Q-62, AC-8)", () => {
  it.each([true, false])(
    "preserves the staff reason and notifyGuest=%s across old and new releases",
    async (notifyGuest) => {
      const { reservationId } = await confirmed({ paid: true, request: false });
      const commands = refundCommands(client, { refund: async () => pending });
      const booking = await client.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      expect(
        (
          await commands.cancel.execute(
            manager,
            reservationId,
            booking.version,
            {
              reason: "CROSS_SYSTEM_CONFLICT",
              notifyGuest,
            },
          )
        ).ok,
      ).toBe(true);
      const request = await client.cancellationRequest.findFirstOrThrow({
        where: { reservationId },
      });
      expect(request).toMatchObject({
        status: "REFUND_PENDING",
        cancelReason: "CROSS_SYSTEM_CONFLICT",
        notifyGuest,
        // A previous release or rollback uses this field to decide whether to send.
        decisionReason: notifyGuest ? "The room is no longer available" : null,
      });
      // Model a previous release still creating requests after the backfill.
      await client.cancellationRequest.update({
        where: { id: request.id },
        data: {
          cancelReason: null,
          notifyGuest: null,
        },
      });
      const payment = await client.payment.findFirstOrThrow({
        where: { reservationId },
      });
      expect(
        await commands.complete.execute({
          paymentId: payment.id,
          attemptKey: `${payment.id}:refund:1`,
          outcome: "SUCCEEDED",
        }),
      ).toMatchObject({ ok: true, value: { applied: true } });
      expect(
        await client.auditEvent.findFirst({
          where: { entityId: reservationId, action: "reservation.cancelled" },
        }),
      ).toMatchObject({
        changes: {
          reason: "CROSS_SYSTEM_CONFLICT",
          guestNotified: notifyGuest,
        },
      });
      expect(
        await client.notificationOutbox.count({
          where: { reservationId, kind: "payment.refunded" },
        }),
      ).toBe(notifyGuest ? 2 : 0);
    },
  );

  it("lets a manager cancel with a refund and tells the guest only when asked", async () => {
    for (const notifyGuest of [false, true]) {
      await reset();
      const { reservationId } = await confirmed({ paid: true, request: false });
      const commands = refundCommands(client);
      commands.refund.mockResolvedValueOnce(succeeded);
      const row = await client.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      const result = await commands.cancel.execute(
        manager,
        reservationId,
        row.version,
        { reason: "GUEST_REQUEST", notifyGuest },
      );
      expect(result).toMatchObject({ ok: true, value: { accepted: true } });
      const after = await state(reservationId);
      expect(after.reservation.status).toBe("CANCELLED");
      expect(after.payment?.status).toBe("REFUNDED");
      expect(after.requests).toEqual([
        expect.objectContaining({
          requestedBy: "STAFF",
          status: "COMPLETED",
          decidedById: admin.id,
        }),
      ]);
      expect(after.kinds.includes("payment.refunded:EMAIL")).toBe(notifyGuest);
    }
  });

  it("supersedes an open guest request and refuses a second cancellation", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(pending);
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    const first = await commands.cancel.execute(
      manager,
      reservationId,
      row.version,
      {
        reason: "OTHER",
        notifyGuest: false,
      },
    );
    expect(first.ok).toBe(true);
    expect(
      (
        await client.cancellationRequest.findUniqueOrThrow({
          where: { id: requestId! },
        })
      ).status,
    ).toBe("CLOSED");
    const current = await client.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    expect(
      await commands.cancel.execute(manager, reservationId, current.version, {
        reason: "OTHER",
        notifyGuest: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(commands.refund).toHaveBeenCalledTimes(1);
  });

  it("refuses a receptionist and an unrelated manager and writes nothing", async () => {
    const { reservationId } = await confirmed({ paid: true, request: false });
    const commands = refundCommands(client);
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    const input = { reason: "OTHER" as const, notifyGuest: false };
    expect(
      await commands.cancel.execute(
        { ...admin, role: "RECEPTIONIST", branchIds: [TEST_BRANCH_ID] },
        reservationId,
        row.version,
        input,
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await commands.cancel.execute(
        { ...admin, role: "MANAGER", branchIds: ["other-branch"] },
        reservationId,
        row.version,
        input,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(
      await commands.cancel.execute(null, reservationId, row.version, input),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    expect(commands.refund).not.toHaveBeenCalled();
    const after = await state(reservationId);
    expect(after.reservation.status).toBe("CONFIRMED");
    expect(after.payment?.status).toBe("SUCCEEDED");
    expect(after.requests).toHaveLength(0);
  });
});

describe("authorization of decisions, retry and queues", () => {
  it("allows only a manager of the branch or an admin", async () => {
    const { reservationId, requestId } = await confirmed({ paid: false });
    const { decide, retry, queries } = refundCommands(client);
    const receptionist = {
      ...admin,
      role: "RECEPTIONIST",
      branchIds: [TEST_BRANCH_ID],
    } as const;
    const outsider = {
      ...admin,
      role: "MANAGER",
      branchIds: ["other-branch"],
    } as const;
    for (const [staff, code] of [
      [null, "UNAUTHENTICATED"],
      [receptionist, "FORBIDDEN"],
      [{ ...admin, role: "EDITOR", branchIds: [] }, "FORBIDDEN"],
      [outsider, "NOT_FOUND"],
    ] as const) {
      expect(await decide.approve(staff, requestId!, {})).toMatchObject({
        ok: false,
        error: { code },
      });
      expect(
        await decide.reject(staff, requestId!, { reason: "x" }),
      ).toMatchObject({ ok: false, error: { code } });
      expect(await retry.execute(staff, "missing-payment")).toMatchObject({
        ok: false,
      });
    }
    expect((await state(reservationId)).requests[0]?.status).toBe("OPEN");

    const page = { page: 1, pageSize: 25 };
    expect(await queries.requests.execute(manager, page)).toMatchObject({
      ok: true,
      value: {
        total: 1,
        items: [{ id: requestId, reference: expect.any(String) }],
      },
    });
    expect(await queries.requests.execute(outsider, page)).toMatchObject({
      ok: true,
      value: { total: 0 },
    });
    expect(
      await queries.requests.execute(manager, { ...page, status: "COMPLETED" }),
    ).toMatchObject({ ok: true, value: { total: 0 } });
    expect(await queries.requests.execute(receptionist, page)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("lists the payments of a reservation for staff of its branch only", async () => {
    const { reservationId } = await confirmed({ paid: true, request: false });
    const { queries } = refundCommands(client);
    const listed = await queries.payments.execute(manager, reservationId);
    expect(listed).toMatchObject({
      ok: true,
      value: {
        items: [{ status: "SUCCEEDED", currency: "USD", refundAttempt: 0 }],
      },
    });
    expect(
      await queries.payments.execute(
        { ...admin, role: "MANAGER", branchIds: ["other-branch"] },
        reservationId,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("a second success with another transaction id", () => {
  it("alerts the branch once and changes nothing else", async () => {
    const { reservationId } = await confirmed({ paid: true, request: false });
    const payment = (await state(reservationId)).payment!;
    const { useCase } = refundCommands(client);
    const second = callbackEvent(payment);
    for (let delivery = 0; delivery < 2; delivery += 1)
      expect(await useCase.execute(signed(second))).toMatchObject({ ok: true });
    const after = await state(reservationId);
    expect(after.payment?.status).toBe("SUCCEEDED");
    expect(
      after.kinds.filter((kind) => kind === "payment.duplicate-alert:EMAIL"),
    ).toHaveLength(1);
    expect(
      await client.auditEvent.count({
        where: { action: "payment.double-charge-suspected" },
      }),
    ).toBe(1);
  });
});

describe("concurrent decisions (20 rounds, observed lock waits)", () => {
  it("lets two approvals of one request start one refund", async () => {
    for (let round = 0; round < 20; round += 1) {
      await reset();
      const { reservationId, requestId } = await confirmed();
      let refunds = 0;
      const refund = async () => {
        refunds += 1;
        return succeeded;
      };
      const paused = pausedAudit();
      await withIndependentClients(2, async ([first, second]) => {
        // The first approval holds the reservation lock after its writes.
        const winner = refundCommands(first!, {
          refund,
          audit: paused.audit,
        }).decide.approve(manager, requestId!, {});
        await paused.reached;
        const loser = refundCommands(second!, { refund }).decide.approve(
          manager,
          requestId!,
          {},
        );
        await waitForLockWaiters(client, 1);
        paused.release();
        const [won, lost] = await Promise.all([winner, loser]);
        expect(won.ok).toBe(true);
        expect(lost).toMatchObject({
          ok: false,
          error: { code: "INVALID_TRANSITION" },
        });
      });
      expect(refunds).toBe(1);
      const after = await state(reservationId);
      expect(after.reservation.status).toBe("CANCELLED");
      expect(after.payment?.refundAttempt).toBe(1);
    }
  }, 300_000);

  it("lets CompleteRefund and a refund callback finish the refund once", async () => {
    for (let round = 0; round < 20; round += 1) {
      await reset();
      const { reservationId, requestId } = await confirmed();
      const first = refundCommands(client);
      first.refund.mockResolvedValueOnce(pending);
      await first.decide.approve(manager, requestId!, {});
      const payment = (await state(reservationId)).payment!;
      const event = callbackEvent(payment, {
        kind: "REFUND",
        outcome: "REFUND_SUCCEEDED",
        refundAttemptKey: `${payment.id}:refund:1`,
      } as never);
      const paused = pausedAudit();
      await withIndependentClients(2, async ([one, two]) => {
        const direct = refundCommands(one!, {
          audit: paused.audit,
        }).complete.execute({
          paymentId: payment.id,
          attemptKey: `${payment.id}:refund:1`,
          outcome: "SUCCEEDED",
        });
        await paused.reached;
        const callback = refundCommands(two!).useCase.execute(signed(event));
        await waitForLockWaiters(client, 1);
        paused.release();
        const [a, b] = await Promise.all([direct, callback]);
        expect(a).toMatchObject({ ok: true, value: { applied: true } });
        expect(b.ok).toBe(true);
      });
      const after = await state(reservationId);
      expect(after.reservation.status).toBe("CANCELLED");
      expect(after.payment?.status).toBe("REFUNDED");
      expect(
        await client.auditEvent.count({
          where: { action: "payment.refunded" },
        }),
      ).toBe(1);
      expect(
        await client.paymentEvent.findUniqueOrThrow({
          where: { providerEventId: event.providerEventId },
        }),
      ).toMatchObject({ result: "IGNORED_STATE" });
      expect(
        after.kinds.filter((kind) => kind === "payment.refunded:EMAIL"),
      ).toHaveLength(1);
    }
  }, 300_000);
});

describe("refund branches found in review", () => {
  it("finishes a refund for a booking that moved on: money back, no cancellation, branch alerted", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(pending);
    await commands.decide.approve(manager, requestId!, {});
    await client.reservation.update({
      where: { id: reservationId },
      data: { status: "CHECKED_IN" },
    });
    const payment = (await state(reservationId)).payment!;
    expect(
      await commands.complete.execute({
        paymentId: payment.id,
        attemptKey: `${payment.id}:refund:1`,
        outcome: "SUCCEEDED",
      }),
    ).toMatchObject({ ok: true, value: { applied: true } });
    const after = await state(reservationId);
    expect(after.reservation.status).toBe("CHECKED_IN");
    expect(after.payment?.status).toBe("REFUNDED");
    expect(after.requests[0]?.status).toBe("COMPLETED");
    expect(after.kinds).toContain("refund.moved-on-alert:EMAIL");
    expect(after.kinds).not.toContain("payment.refunded:EMAIL");
    expect(
      await client.auditEvent.findFirst({
        where: { action: "cancellation-request.completed" },
      }),
    ).toMatchObject({ changes: { cancelled: false } });
  });

  it("refuses a retry for a booking that moved on", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(failed);
    await commands.decide.approve(manager, requestId!, {});
    await client.reservation.update({
      where: { id: reservationId },
      data: { status: "CHECKED_IN" },
    });
    const payment = (await state(reservationId)).payment!;
    expect(await commands.retry.execute(manager, payment.id)).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION" },
    });
    expect(commands.refund).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["SUCCEEDED", "REFUNDED", "REFUNDED"],
    ["FAILED", "REFUND_FAILED", "PAID"],
  ] as const)(
    "finishes an automatic refund with no request (%s)",
    async (outcome, paymentStatus, reservationPayment) => {
      const { reservationId } = await confirmed({ paid: true, request: false });
      const payment = (await state(reservationId)).payment!;
      await client.payment.update({
        where: { id: payment.id },
        data: { status: "REFUND_PENDING", refundAttempt: 1 },
      });
      await client.reservation.update({
        where: { id: reservationId },
        data: { status: "CANCELLED", paymentStatus: "REFUND_PENDING" },
      });
      const commands = refundCommands(client);
      expect(
        await commands.complete.execute({
          paymentId: payment.id,
          attemptKey: `${payment.id}:refund:1`,
          outcome,
        }),
      ).toMatchObject({ ok: true, value: { applied: true } });
      const after = await state(reservationId);
      expect(after.payment?.status).toBe(paymentStatus);
      expect(after.reservation).toMatchObject({
        status: "CANCELLED",
        paymentStatus: reservationPayment,
      });
      expect(after.kinds.includes("refund.staff-alert:EMAIL")).toBe(
        outcome === "FAILED",
      );
    },
  );

  it("tells the guest nothing when the refund of a paid staff cancellation fails", async () => {
    const { reservationId } = await confirmed({ paid: true, request: false });
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(failed);
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    await commands.cancel.execute(manager, reservationId, row.version, {
      reason: "OTHER",
      notifyGuest: true,
    });
    const after = await state(reservationId);
    expect(after.payment?.status).toBe("REFUND_FAILED");
    expect(after.reservation.status).toBe("CONFIRMED");
    expect(
      after.kinds.filter((kind) => kind.startsWith("payment.refunded")),
    ).toEqual([]);
    expect(after.kinds).toContain("refund.staff-alert:EMAIL");
    // The guest views show only the guest's own requests.
    expect(
      await new (
        await import(
          "@/infrastructure/db/prisma/repositories/reservations/cancellation-request-store"
        )
      ).PrismaCancellationRequestStore(client).findCurrent(reservationId),
    ).toBeNull();
  });

  it("refuses a queue read for a branch the manager does not manage", async () => {
    await confirmed({ paid: false });
    const { queries } = refundCommands(client);
    expect(
      await queries.requests.execute(
        { ...admin, role: "MANAGER", branchIds: ["other-branch"] },
        { branchId: TEST_BRANCH_ID, page: 1, pageSize: 25 },
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await queries.requests.execute(manager, {
        branchId: TEST_BRANCH_ID,
        page: 1,
        pageSize: 25,
      }),
    ).toMatchObject({ ok: true, value: { total: 1 } });
  });
});

describe("second review round", () => {
  it("refuses check in and no show while a refund is pending, and allows them after a failure", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(pending);
    await commands.decide.approve(manager, requestId!, {});
    // Arrival day, so the state machine itself would allow both actions.
    const arrival = () =>
      staffReservationCommands({
        client,
        clock: { now: () => new Date("2031-04-10T12:00:00Z") },
      });
    const booked = await client.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      include: { rooms: true },
    });
    const assigned = await arrival().assignRoom.execute(
      manager,
      reservationId,
      booked.rooms[0]!.id,
      booked.version,
      "garden-unit-0",
    );
    expect(assigned.ok).toBe(true);
    for (const action of ["checkIn", "markNoShow"] as const) {
      const row = await client.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      expect(
        await arrival()[action].execute(manager, reservationId, row.version),
      ).toMatchObject({
        ok: false,
        error: {
          code: "INVALID_TRANSITION",
          message: expect.stringContaining("refund is in progress"),
        },
      });
    }
    const payment = (await state(reservationId)).payment!;
    await commands.complete.execute({
      paymentId: payment.id,
      attemptKey: `${payment.id}:refund:1`,
      outcome: "FAILED",
    });
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    // A failed refund never blocks the front desk.
    expect(
      await arrival().checkIn.execute(manager, reservationId, row.version),
    ).toMatchObject({ ok: true });
  });

  it("replays a paid S9 on a cancelled booking instead of refusing it", async () => {
    const { reservationId } = await confirmed({ paid: true, request: false });
    await client.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELLED" },
    });
    const commands = refundCommands(client);
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    expect(
      await commands.cancel.execute(manager, reservationId, row.version, {
        reason: "OTHER",
        notifyGuest: false,
      }),
    ).toMatchObject({ ok: true, value: { replayed: true, accepted: false } });
    expect(commands.refund).not.toHaveBeenCalled();
  });

  it("counts a lookup answer for an older attempt as still pending", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(pending);
    await commands.decide.approve(manager, requestId!, {});
    const payment = (await state(reservationId)).payment!;
    const old = callbackEvent(payment, {
      kind: "REFUND",
      outcome: "REFUND_FAILED",
      refundAttemptKey: `${payment.id}:refund:0`,
    } as never);
    const jobs = paymentJobs(client, {
      now: () => new Date(NOW.getTime() + 11 * 60_000),
      getTransaction: async () => old,
    });
    expect(await jobs.reconcile.run()).toMatchObject({
      answered: 0,
      pending: 1,
    });
    expect((await state(reservationId)).payment?.status).toBe("REFUND_PENDING");
  });
});

describe("staff routes (S9, S17 to S19, S44, S45)", () => {
  const origin = process.env.APP_URL ?? "http://localhost:3000";
  const headers = (staff: string, version?: number) => ({
    origin,
    "content-type": "application/json",
    "x-test-staff": staff,
    ...(version === undefined ? {} : { "if-match": `"v${version}"` }),
  });
  const call = (
    handler: (request: Request, context: never) => Promise<Response>,
    path: string,
    id: string,
    options: {
      method?: "GET" | "POST";
      noBody?: boolean;
      body?: unknown;
      staff?: string;
      version?: number;
    } = {},
  ) =>
    handler(
      new Request(new URL(`/api/v1/staff/${path}`, origin), {
        method: options.method ?? "POST",
        ...(options.method === "GET" || options.noBody
          ? {}
          : { body: JSON.stringify(options.body ?? {}) }),
        headers: options.noBody
          ? { origin, "x-test-staff": options.staff ?? "manager" }
          : headers(options.staff ?? "manager", options.version),
      }),
      { params: Promise.resolve({ id }) } as never,
    );

  beforeEach(() => {
    principals.set("manager", manager);
    principals.set("admin", admin);
    principals.set("receptionist", {
      ...admin,
      role: "RECEPTIONIST",
      branchIds: [TEST_BRANCH_ID],
    });
  });

  it("answers 200 for an unpaid approval, 202 for a paid one, and 200 for a rejection", async () => {
    const unpaid = await confirmed({ paid: false });
    const ok = await call(
      approveRoute,
      `cancellation-requests/${unpaid.requestId}/approval`,
      unpaid.requestId!,
      { noBody: true },
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      id: unpaid.requestId,
      reservationId: unpaid.reservationId,
      status: "COMPLETED",
    });

    const paid = await confirmed({ paid: true, phone: 2 });
    const started = await call(
      approveRoute,
      `cancellation-requests/${paid.requestId}/approval`,
      paid.requestId!,
      { body: { note: "ok" } },
    );
    // The process gateway does not know this test payment: the refund is
    // pending or already refused, and never cancelled.
    expect(started.status).toBe(202);
    expect(["REFUND_PENDING", "REFUND_FAILED"]).toContain(
      ((await started.json()) as { status: string }).status,
    );
    expect((await state(paid.reservationId)).reservation.status).toBe(
      "CONFIRMED",
    );

    const third = await confirmed({ paid: false, phone: 3 });
    const rejected = await call(
      rejectRoute,
      `cancellation-requests/${third.requestId}/rejection`,
      third.requestId!,
      { body: { reason: "Not possible" } },
    );
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({ status: "REJECTED" });
    const noReason = await call(
      rejectRoute,
      `cancellation-requests/${third.requestId}/rejection`,
      third.requestId!,
      { body: {} },
    );
    expect(noReason.status).toBe(422);
  });

  it("refuses a receptionist and an unknown session", async () => {
    const { requestId } = await confirmed({ paid: false });
    for (const [staff, status] of [
      ["receptionist", 403],
      ["nobody", 401],
    ] as const) {
      const response = await call(
        approveRoute,
        `cancellation-requests/${requestId}/approval`,
        requestId!,
        { staff },
      );
      expect(response.status).toBe(status);
    }
    expect(
      (
        await call(listRoute, "cancellation-requests", "-", {
          method: "GET",
          staff: "receptionist",
        })
      ).status,
    ).toBe(403);
  });

  it("lists the queue and the payments, and answers 202 for a paid staff cancellation", async () => {
    const { reservationId, requestId } = await confirmed();
    const queue = await call(listRoute, "cancellation-requests", "-", {
      method: "GET",
    });
    expect(queue.status).toBe(200);
    expect(await queue.json()).toMatchObject({
      total: 1,
      items: [{ id: requestId, status: "OPEN", paymentStatus: "PAID" }],
    });
    const payments = await call(
      paymentsRoute,
      `reservations/${reservationId}/payments`,
      reservationId,
      { method: "GET" },
    );
    expect(payments.status).toBe(200);
    const listed = (await payments.json()) as { items: { id: string }[] };
    expect(listed.items).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toMatch(/payload|card/i);

    // Retrying a refund that did not fail is refused.
    const retry = await call(
      retryRoute,
      `payments/${listed.items[0]!.id}/refund-retry`,
      listed.items[0]!.id,
    );
    expect(retry.status).toBe(409);

    const version = (
      await client.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      })
    ).version;
    const cancelled = await call(
      cancelRoute,
      `reservations/${reservationId}/cancellation`,
      reservationId,
      {
        body: { reason: "OTHER", notifyGuest: false },
        version,
        staff: "receptionist",
      },
    );
    expect(cancelled.status).toBe(403);
    const accepted = await call(
      cancelRoute,
      `reservations/${reservationId}/cancellation`,
      reservationId,
      { body: { reason: "OTHER", notifyGuest: false }, version },
    );
    expect(accepted.status).toBe(202);
    // The process gateway does not know this test payment, so the refund is
    // refused at once: the booking stays confirmed and the failure is visible.
    const body = (await accepted.json()) as {
      status: string;
      paymentStatus: string;
    };
    expect(body.status).toBe("CONFIRMED");
    expect(["PAID", "REFUND_PENDING"]).toContain(body.paymentStatus);
    expect(["REFUND_FAILED", "REFUND_PENDING"]).toContain(
      (await state(reservationId)).payment?.status,
    );
  });

  it("answers 202 for a refund retry of a failed refund", async () => {
    const { reservationId, requestId } = await confirmed();
    const commands = refundCommands(client);
    commands.refund.mockResolvedValueOnce(failed);
    await commands.decide.approve(manager, requestId!, {});
    const payment = (await state(reservationId)).payment!;
    expect(payment.status).toBe("REFUND_FAILED");
    const response = await call(
      retryRoute,
      `payments/${payment.id}/refund-retry`,
      payment.id,
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ paymentId: payment.id });
  });
});
