import { describe, expect, it, vi } from "vitest";

import {
  RefundDispatcher,
  type SendRefundContext,
  type ReservationUnitOfWork,
} from "@/application/reservations";
import { success } from "@/application/shared/result";

const NOW = new Date("2031-03-01T10:00:00Z");
const request = {
  paymentId: "payment-1",
  providerTransactionId: "tx-1",
  amountMinor: 1000,
  currency: "USD",
  idempotencyKey: "payment-1:refund:1",
};

function build(options: {
  refund: () => Promise<{ status: "PENDING" | "SUCCEEDED" | "FAILED" }>;
  stamp?: () => Promise<void>;
  timeoutMs?: number;
}) {
  const complete = { execute: vi.fn(async () => success({ applied: true })) };
  const stamp = vi.fn(options.stamp ?? (async () => {}));
  const unitOfWork = {
    run: (work: (context: SendRefundContext) => Promise<unknown>) =>
      work({ payments: { markRefundRequested: stamp } } as never),
  } as unknown as ReservationUnitOfWork<SendRefundContext>;
  const dispatcher = new RefundDispatcher({
    gateway: { refund: vi.fn(options.refund) },
    unitOfWork,
    complete,
    clock: { now: () => NOW },
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
  return { dispatcher, complete, stamp };
}

describe("RefundDispatcher", () => {
  it("gives up on a call that hangs and leaves the attempt unstamped", async () => {
    const { dispatcher, complete, stamp } = build({
      refund: () => new Promise<never>(() => {}),
      timeoutMs: 5,
    });
    expect(await dispatcher.send(request, 1)).toBe(false);
    expect(stamp).not.toHaveBeenCalled();
    expect(complete.execute).not.toHaveBeenCalled();
  });

  it("stamps a pending refund and waits for the callback", async () => {
    const { dispatcher, complete, stamp } = build({
      refund: async () => ({ status: "PENDING" }),
    });
    expect(await dispatcher.send(request, 1)).toBe(true);
    expect(stamp).toHaveBeenCalledWith("payment-1", NOW, undefined, 1);
    expect(complete.execute).not.toHaveBeenCalled();
  });

  it("completes an immediate answer with the key it sent", async () => {
    const { dispatcher, complete } = build({
      refund: async () => ({ status: "FAILED" }),
    });
    await dispatcher.send(request, 1);
    expect(complete.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptKey: "payment-1:refund:1",
        outcome: "FAILED",
      }),
    );
  });

  it("does not throw when the stamp fails after the commit", async () => {
    const { dispatcher, complete } = build({
      refund: async () => ({ status: "SUCCEEDED" }),
      stamp: async () => {
        throw new Error("connection lost");
      },
    });
    expect(await dispatcher.send(request, 1)).toBe(false);
    expect(complete.execute).not.toHaveBeenCalled();
  });
});
