import { describe, expect, it } from "vitest";
import {
  REQUEST_REASON_MAX,
  canGuestChange,
  canRequestCancellation,
  canTransitionCancellationRequest,
  closedReasonForStaffAction,
  decideChangeApplication,
  isActiveRequest,
  parseRejectionReason,
  planApproval,
} from "@/domain/reservations";
import { DomainValidationError } from "@/domain/shared/domain-error";
import {
  CANCELLATION_REQUEST_STATUSES,
  RESERVATION_PAYMENT_STATUSES,
  RESERVATION_STATUSES,
  type CancellationRequestStatus,
} from "@/domain/shared/types";

const now = new Date("2026-01-10T10:00:00.000Z");
const later = new Date("2026-01-14T12:00:00.000Z");
const earlier = new Date("2026-01-10T09:00:00.000Z");

const facts = {
  reservationStatus: "CONFIRMED",
  paymentStatus: "PAID",
  requestStatuses: [],
  phoneBlocked: false,
  now,
} as const;

describe("T-CXL-3: who may request, and when (CX-2, CX-6)", () => {
  const request = (changes = {}) =>
    canRequestCancellation({ ...facts, deadline: later, ...changes });
  it("allows a confirmed reservation with no active request before the deadline", () => {
    expect(request()).toEqual({ allowed: true });
  });
  it("lets finished requests go: rejected, completed and closed do not block", () => {
    expect(
      request({ requestStatuses: ["REJECTED", "COMPLETED", "CLOSED"] }),
    ).toEqual({ allowed: true });
  });
  it.each(CANCELLATION_REQUEST_STATUSES)(
    "counts %s as active only while the request is still in play",
    (status) => {
      const active = ["OPEN", "APPROVED", "REFUND_PENDING", "REFUND_FAILED"];
      expect(isActiveRequest(status)).toBe(active.includes(status));
      expect(request({ requestStatuses: [status] }).allowed).toBe(
        !active.includes(status),
      );
    },
  );
  it("refuses while a refund is running, and a blocked phone", () => {
    expect(request({ paymentStatus: "REFUND_PENDING" })).toEqual({
      allowed: false,
      code: "REFUND_IN_PROGRESS",
    });
    expect(request({ phoneBlocked: true })).toEqual({
      allowed: false,
      code: "PHONE_BLOCKED",
    });
  });
  it("rejects an unknown request status", () => {
    expect(() => request({ requestStatuses: ["OPENED"] })).toThrow(
      DomainValidationError,
    );
  });
  it.each(RESERVATION_STATUSES.filter((status) => status !== "CONFIRMED"))(
    "refuses a reservation in %s",
    (reservationStatus) => {
      expect(request({ reservationStatus })).toEqual({
        allowed: false,
        code: "NOT_CONFIRMED",
      });
    },
  );
  it("allows only one active request of either kind", () => {
    for (const status of [
      "OPEN",
      "APPROVED",
      "REFUND_PENDING",
      "REFUND_FAILED",
    ])
      expect(request({ requestStatuses: ["COMPLETED", status] })).toEqual({
        allowed: false,
        code: "REQUEST_ALREADY_OPEN",
      });
  });
  it("refuses at and after the deadline, and with no deadline", () => {
    for (const deadline of [now, earlier, null])
      expect(request({ deadline })).toEqual({
        allowed: false,
        code: "DEADLINE_PASSED",
      });
  });
});

describe("request status machine (CX-3…5, Q-96)", () => {
  const allowed: Record<
    CancellationRequestStatus,
    CancellationRequestStatus[]
  > = {
    OPEN: ["APPROVED", "REJECTED", "CLOSED"],
    APPROVED: ["COMPLETED", "REFUND_PENDING"],
    REFUND_PENDING: ["COMPLETED", "REFUND_FAILED"],
    REFUND_FAILED: ["REFUND_PENDING"],
    REJECTED: [],
    COMPLETED: [],
    CLOSED: [],
  };
  it("allows exactly the documented transitions", () => {
    for (const from of CANCELLATION_REQUEST_STATUSES)
      for (const to of CANCELLATION_REQUEST_STATUSES)
        expect(canTransitionCancellationRequest(from, to)).toBe(
          allowed[from].includes(to),
        );
  });
  it("rejects an unknown status", () => {
    expect(() =>
      canTransitionCancellationRequest("OPENED" as never, "CLOSED"),
    ).toThrow(DomainValidationError);
  });
});

describe("approval and rejection (CX-4, CX-5)", () => {
  it("cancels an unpaid booking at once and refunds a paid one first", () => {
    expect(
      planApproval({
        reservationStatus: "CONFIRMED",
        paymentStatus: "NOT_REQUIRED",
      }),
    ).toBe("CANCEL_NOW");
    expect(
      planApproval({ reservationStatus: "CONFIRMED", paymentStatus: "PAID" }),
    ).toBe("REFUND_FIRST");
  });
  it("refuses every other payment state and every other reservation status", () => {
    for (const reservationStatus of RESERVATION_STATUSES)
      for (const paymentStatus of RESERVATION_PAYMENT_STATUSES) {
        const expected =
          reservationStatus !== "CONFIRMED"
            ? "NOT_APPROVABLE"
            : paymentStatus === "NOT_REQUIRED"
              ? "CANCEL_NOW"
              : paymentStatus === "PAID"
                ? "REFUND_FIRST"
                : "NOT_APPROVABLE";
        expect(planApproval({ reservationStatus, paymentStatus })).toBe(
          expected,
        );
      }
  });
  it("requires a trimmed reason of 1 to 500 characters to reject", () => {
    expect(parseRejectionReason("  Fully booked  ")).toBe("Fully booked");
    expect(parseRejectionReason("x".repeat(REQUEST_REASON_MAX))).toHaveLength(
      REQUEST_REASON_MAX,
    );
    for (const bad of ["", "   ", "x".repeat(REQUEST_REASON_MAX + 1), 7, null])
      expect(() => parseRejectionReason(bad)).toThrow(DomainValidationError);
  });
});

describe("guest changes (GC-2, GC-4, Q-85)", () => {
  const change = (changes = {}) =>
    canGuestChange({
      ...facts,
      currentDeadline: later,
      newDeadline: later,
      ...changes,
    });
  it("allows a change when both deadlines are open", () => {
    expect(change()).toEqual({ allowed: true });
  });
  it("checks the deadline of the new arrival date as well as the current one", () => {
    expect(change({ newDeadline: earlier })).toEqual({
      allowed: false,
      code: "DEADLINE_PASSED",
    });
    expect(change({ newDeadline: null })).toEqual({
      allowed: false,
      code: "DEADLINE_PASSED",
    });
    expect(change({ currentDeadline: earlier })).toEqual({
      allowed: false,
      code: "DEADLINE_PASSED",
    });
  });
  it("refuses a blocked phone, a non-confirmed booking, and an open request", () => {
    expect(change({ phoneBlocked: true })).toEqual({
      allowed: false,
      code: "PHONE_BLOCKED",
    });
    expect(change({ reservationStatus: "CHECKED_IN" })).toEqual({
      allowed: false,
      code: "NOT_CONFIRMED",
    });
    expect(change({ requestStatuses: ["OPEN"] })).toEqual({
      allowed: false,
      code: "REQUEST_ALREADY_OPEN",
    });
  });
  it("refuses a change while a cancellation is mid-refund", () => {
    for (const status of ["APPROVED", "REFUND_PENDING", "REFUND_FAILED"])
      expect(change({ requestStatuses: [status] })).toEqual({
        allowed: false,
        code: "REQUEST_ALREADY_OPEN",
      });
    expect(change({ paymentStatus: "REFUND_PENDING" })).toEqual({
      allowed: false,
      code: "REFUND_IN_PROGRESS",
    });
  });
  it("applies pay-at-hotel changes at once whatever the total", () => {
    expect(
      decideChangeApplication({
        paymentMethod: "PAY_AT_HOTEL",
        paidTotalMinor: 10_000,
        newTotalMinor: 30_000,
      }),
    ).toBe("APPLY_NOW");
  });
  it("applies a paid change at once only when the total equals the paid total", () => {
    const paid = {
      paymentMethod: "ONLINE",
      paidTotalMinor: 10_000,
    } as const;
    expect(decideChangeApplication({ ...paid, newTotalMinor: 10_000 })).toBe(
      "APPLY_NOW",
    );
    for (const newTotalMinor of [9_999, 10_001])
      expect(decideChangeApplication({ ...paid, newTotalMinor })).toBe(
        "REQUEST_APPROVAL",
      );
  });
  it.each([-1, 1.5, Number.NaN])("rejects the total %s", (newTotalMinor) => {
    expect(() =>
      decideChangeApplication({
        paymentMethod: "ONLINE",
        paidTotalMinor: 100,
        newTotalMinor,
      }),
    ).toThrow(DomainValidationError);
  });
});

describe("Q-96: closing an open request", () => {
  it("maps each staff action to its closure reason", () => {
    expect(closedReasonForStaffAction("CANCEL")).toBe("STAFF_CANCELLED");
    expect(closedReasonForStaffAction("MARK_NO_SHOW")).toBe("NO_SHOW");
    expect(closedReasonForStaffAction("CHECK_IN")).toBe("CHECKED_IN");
    expect(() => closedReasonForStaffAction("CHECK_OUT" as never)).toThrow(
      DomainValidationError,
    );
  });
});
