import { describe, expect, it, vi } from "vitest";

import type { PaymentSweepStore, SweepPayment } from "@/application/payments";
import {
  ExpirePaymentHolds,
  ReconcilePayments,
  type ExpirePaymentHoldsContext,
  type ReconcilePaymentsContext,
  type ReservationUnitOfWork,
} from "@/application/reservations";
import { failure, success } from "@/application/shared/result";

const NOW = new Date("2031-03-01T10:00:00Z");
const clock = { now: () => NOW };

function unitOfWork<Context>(context: Partial<Context>) {
  return {
    run: (work: (context: Context) => Promise<unknown>) =>
      work(context as Context),
  } as unknown as ReservationUnitOfWork<Context>;
}

const none = async () => [];
const sweepOf = (overrides: Partial<PaymentSweepStore> = {}) =>
  ({
    findOverdueHolds: none,
    findStaleInitiated: none,
    findUnsentRefunds: none,
    findHeldCleanup: none,
    ...overrides,
  }) satisfies PaymentSweepStore;

describe("ExpirePaymentHolds", () => {
  it("counts a busy booking and a thrown one as failed and keeps going", async () => {
    const lockById = vi
      .fn()
      .mockResolvedValueOnce(failure("TRY_AGAIN", "busy"))
      .mockRejectedValueOnce(new Error("database"))
      .mockResolvedValueOnce(success(null))
      .mockResolvedValueOnce(
        success({ status: "CONFIRMED", holdExpiresAt: null }),
      );
    const job = new ExpirePaymentHolds({
      unitOfWork: unitOfWork<ExpirePaymentHoldsContext>({
        reservations: { lockById } as never,
      }),
      sweep: sweepOf({
        findOverdueHolds: async () =>
          ["a", "b", "c", "d"].map((id) => ({ id, branchId: "branch" })),
      }),
      clock,
    });
    expect(await job.run()).toEqual({ expired: 0, skipped: 2, failed: 2 });
    expect(lockById).toHaveBeenCalledTimes(4);
  });

  it("reads on past an item that stays overdue instead of stalling on it", async () => {
    const stuck = Array.from({ length: 100 }, (_, index) => ({
      id: `stuck-${index}`,
      branchId: "branch",
    }));
    const findOverdueHolds = vi
      .fn()
      .mockResolvedValueOnce(stuck)
      .mockResolvedValueOnce([{ id: "fresh", branchId: "branch" }]);
    const lockById = vi.fn().mockRejectedValue(new Error("database"));
    const summary = await new ExpirePaymentHolds({
      unitOfWork: unitOfWork<ExpirePaymentHoldsContext>({
        reservations: { lockById } as never,
      }),
      sweep: sweepOf({ findOverdueHolds }),
      clock,
    }).run();
    expect(summary.failed).toBe(101);
    expect(findOverdueHolds).toHaveBeenNthCalledWith(
      2,
      NOW,
      100,
      stuck.map(({ id }) => id),
    );
  });

  it("asks for a bounded batch as of now", async () => {
    const findOverdueHolds = vi.fn(async () => []);
    await new ExpirePaymentHolds({
      unitOfWork: unitOfWork<ExpirePaymentHoldsContext>({}),
      sweep: sweepOf({ findOverdueHolds }),
      clock,
    }).run();
    expect(findOverdueHolds).toHaveBeenCalledWith(NOW, 100, []);
  });
});

describe("ReconcilePayments", () => {
  const payment: SweepPayment = {
    id: "payment-1",
    branchId: "branch",
    reservationId: "reservation-1",
    providerOrderId: null,
    providerTransactionId: null,
    amountMinor: 1000,
    currency: "USD",
    refundAttempt: 1,
    expiresAt: NOW,
    statusChangedAt: NOW,
  };
  const build = (
    sweep: Partial<PaymentSweepStore>,
    gateway: { getTransaction: never; refund: never },
  ) =>
    new ReconcilePayments({
      unitOfWork: unitOfWork<ReconcilePaymentsContext>({}),
      sweep: sweepOf(sweep),
      callback: { applyVerifiedEvent: vi.fn(async () => success(undefined)) },
      gateway,
      provider: "test-gateway",
      clock,
    });

  it("reads nothing and calls nothing without a gateway", async () => {
    const findStaleInitiated = vi.fn(none);
    const summary = await new ReconcilePayments({
      unitOfWork: unitOfWork<ReconcilePaymentsContext>({}),
      sweep: sweepOf({ findStaleInitiated }),
      callback: { applyVerifiedEvent: vi.fn() },
      clock,
    }).run();
    expect(summary.gatewayReady).toBe(false);
    expect(findStaleInitiated).not.toHaveBeenCalled();
  });

  it("isolates a failing item and runs the later steps", async () => {
    const getTransaction = vi.fn().mockRejectedValue(new Error("network"));
    const findUnsentRefunds = vi.fn(async () => [payment]);
    const findHeldCleanup = vi.fn(async () => [payment]);
    const summary = await build(
      {
        findStaleInitiated: async () => [payment, payment],
        findUnsentRefunds,
        findHeldCleanup,
      },
      { getTransaction: getTransaction as never, refund: vi.fn() as never },
    ).run();
    expect(summary).toMatchObject({ gatewayReady: true, failed: 4 });
    expect(findUnsentRefunds).toHaveBeenCalledWith(
      "test-gateway",
      new Date(NOW.getTime() - 120_000),
      50,
      [],
    );
    expect(findHeldCleanup).toHaveBeenCalledWith("test-gateway", NOW, 50, []);
  });

  it("counts a gateway call that hangs as a failure and moves on", async () => {
    const getTransaction = vi.fn(() => new Promise<never>(() => {}));
    const summary = await new ReconcilePayments({
      unitOfWork: unitOfWork<ReconcilePaymentsContext>({}),
      sweep: sweepOf({ findStaleInitiated: async () => [payment, payment] }),
      callback: { applyVerifiedEvent: vi.fn() },
      gateway: {
        getTransaction: getTransaction as never,
        refund: vi.fn() as never,
      },
      provider: "test-gateway",
      clock,
      gatewayTimeoutMs: 5,
    }).run();
    expect(summary).toMatchObject({ failed: 2, answered: 0 });
    expect(getTransaction).toHaveBeenCalledTimes(2);
  });

  it("reads on past stuck refunds so a newer refund is still sent", async () => {
    const stuck = Array.from({ length: 50 }, (_, index) => ({
      ...payment,
      id: `stuck-${index}`,
    }));
    const fresh = { ...payment, id: "fresh", providerTransactionId: "tx-1" };
    const findUnsentRefunds = vi
      .fn()
      .mockResolvedValueOnce(stuck)
      .mockResolvedValueOnce([fresh]);
    const getTransaction = vi.fn(async () => "NOT_FOUND" as const);
    const refund = vi.fn(async () => ({ status: "PENDING" as const }));
    const context = {
      reservations: { lockById: async () => success({}) },
      payments: { markRefundRequested: vi.fn(async () => {}) },
    };
    const summary = await new ReconcilePayments({
      unitOfWork: unitOfWork<ReconcilePaymentsContext>(context as never),
      sweep: sweepOf({ findUnsentRefunds }),
      callback: { applyVerifiedEvent: vi.fn() },
      gateway: {
        getTransaction: getTransaction as never,
        refund: refund as never,
      },
      provider: "test-gateway",
      clock,
    }).run();
    // The 50 stuck refunds have no transaction id and stay pending; the fresh one is sent.
    expect(summary).toMatchObject({ refundsSent: 1, pending: 50 });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(context.payments.markRefundRequested).toHaveBeenCalledWith(
      "fresh",
      NOW,
      undefined,
      1,
    );
  });
});
