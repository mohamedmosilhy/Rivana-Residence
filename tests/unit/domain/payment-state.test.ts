import { describe, expect, it } from "vitest";
import {
  canTransitionPayment,
  decidePaymentSuccess,
  matchesPayment,
  reservationPaymentStatusFor,
} from "@/domain/payments";
import { DomainValidationError } from "@/domain/shared/domain-error";
import {
  PAYMENT_STATUSES,
  RESERVATION_STATUSES,
  type PaymentStatus,
} from "@/domain/shared/types";

const allowed: Record<PaymentStatus, PaymentStatus[]> = {
  INITIATED: ["SUCCEEDED", "EXPIRED", "FAILED"],
  SUCCEEDED: ["REFUND_PENDING"],
  EXPIRED: ["SUCCEEDED"],
  FAILED: ["SUCCEEDED"],
  REFUND_PENDING: ["REFUNDED", "REFUND_FAILED"],
  REFUND_FAILED: ["REFUND_PENDING"],
  REFUNDED: [],
};

describe("T-PAY: payment state", () => {
  it("allows exactly the documented transitions and no others", () => {
    for (const from of PAYMENT_STATUSES)
      for (const to of PAYMENT_STATUSES)
        expect(canTransitionPayment(from, to)).toBe(allowed[from].includes(to));
  });
  it("rejects an unknown status", () => {
    expect(() =>
      canTransitionPayment("PAID" as PaymentStatus, "SUCCEEDED"),
    ).toThrow(DomainValidationError);
  });
  it("shows a failed refund as still paid, never as refunded", () => {
    expect(
      PAYMENT_STATUSES.map((status) => reservationPaymentStatusFor(status)),
    ).toEqual([
      "AWAITING",
      "PAID",
      "FAILED",
      "FAILED",
      "REFUND_PENDING",
      "REFUNDED",
      "PAID",
    ]);
  });
});

describe("T-PAY-1: amount and currency must match (PY-3)", () => {
  const payment = { amountMinor: 12_500, currency: "USD" };
  it("accepts an exact match", () => {
    expect(matchesPayment(payment, { ...payment })).toBe(true);
  });
  it.each([
    [{ amountMinor: 12_499, currency: "USD" }],
    [{ amountMinor: 12_501, currency: "USD" }],
    [{ amountMinor: 12_500, currency: "EGP" }],
    [{ amountMinor: 12_500, currency: "usd" }],
  ])("refuses %j", (event) => {
    expect(matchesPayment(payment, event)).toBe(false);
  });
  it("refuses a payment recorded in another currency", () => {
    expect(
      matchesPayment(
        { amountMinor: 100, currency: "EGP" },
        { amountMinor: 100, currency: "EGP" },
      ),
    ).toBe(false);
  });
  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, "12500"])(
    "treats the outside event amount %s as a mismatch, never an exception",
    (amountMinor) => {
      expect(
        matchesPayment(payment, {
          amountMinor: amountMinor as number,
          currency: "USD",
        }),
      ).toBe(false);
    },
  );
  it.each([0, -1, 1.5, Number.NaN])(
    "rejects our own malformed payment amount %s",
    (amountMinor) => {
      expect(() =>
        matchesPayment(
          { amountMinor, currency: "USD" },
          { amountMinor: 100, currency: "USD" },
        ),
      ).toThrow(DomainValidationError);
    },
  );
});

describe("T-PAY-2: success decision (PY-4, PY-5, Q-63)", () => {
  const decide = (
    reservationStatus: (typeof RESERVATION_STATUSES)[number],
    paymentStatus: PaymentStatus,
    unitsFree = true,
  ) => decidePaymentSuccess({ reservationStatus, paymentStatus, unitsFree });
  it("confirms while the hold is live, whether or not other units are free", () => {
    expect(decide("AWAITING_PAYMENT", "INITIATED", false)).toBe("CONFIRM");
  });
  it("confirms a late success only when every unit is still free", () => {
    for (const paymentStatus of ["EXPIRED", "FAILED"] as const) {
      expect(decide("PAYMENT_FAILED", paymentStatus, true)).toBe(
        "CONFIRM_LATE",
      );
      expect(decide("PAYMENT_FAILED", paymentStatus, false)).toBe(
        "REFUND_AUTOMATICALLY",
      );
    }
  });
  it("refunds a success for a booking that was cancelled or finished", () => {
    for (const status of [
      "CANCELLED",
      "CHECKED_IN",
      "CHECKED_OUT",
      "NO_SHOW",
    ] as const)
      expect(decide(status, "INITIATED")).toBe("REFUND_AUTOMATICALLY");
  });
  it("covers every reservation and payment status without a gap", () => {
    for (const status of RESERVATION_STATUSES)
      for (const paymentStatus of PAYMENT_STATUSES)
        for (const unitsFree of [true, false]) {
          const result = decide(status, paymentStatus, unitsFree);
          if (!canTransitionPayment(paymentStatus, "SUCCEEDED"))
            expect(result).toBe("IGNORE_DUPLICATE");
          else if (status === "AWAITING_PAYMENT")
            expect(result).toBe("CONFIRM");
          else if (status === "PAYMENT_FAILED" && unitsFree)
            expect(result).toBe("CONFIRM_LATE");
          else expect(result).toBe("REFUND_AUTOMATICALLY");
        }
  });
  it("rejects a malformed input", () => {
    expect(() =>
      decidePaymentSuccess({
        reservationStatus: "BOOKED" as never,
        paymentStatus: "INITIATED",
        unitsFree: true,
      }),
    ).toThrow(DomainValidationError);
    expect(() =>
      decidePaymentSuccess({
        reservationStatus: "CONFIRMED",
        paymentStatus: "INITIATED",
        unitsFree: "yes" as never,
      }),
    ).toThrow(DomainValidationError);
  });
  it("ignores a repeat once the payment succeeded or moved to refund", () => {
    for (const paymentStatus of [
      "SUCCEEDED",
      "REFUND_PENDING",
      "REFUNDED",
      "REFUND_FAILED",
    ] as const)
      for (const status of RESERVATION_STATUSES)
        expect(decide(status, paymentStatus)).toBe("IGNORE_DUPLICATE");
  });
});
