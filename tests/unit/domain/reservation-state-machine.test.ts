import { describe, expect, it } from "vitest";
import {
  ReservationStateMachine,
  consumesInventory,
  isTerminalReservation,
  canModifyReservationStay,
  canEditReservationGuest,
  type ReservationState,
  type ReservationAction,
} from "@/domain/reservations";
import {
  RESERVATION_STATUSES,
  RESERVATION_SOURCES,
  RESERVATION_PAYMENT_STATUSES,
} from "@/domain/shared/types";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import { DomainValidationError } from "@/domain/shared/domain-error";
const day = LocalDate.parse;
const stay = StayRange.create(day("2026-11-15"), day("2026-11-18"));
const state = (changes: Partial<ReservationState> = {}): ReservationState => ({
  status: "CONFIRMED",
  stay,
  paymentMethod: "PAY_AT_HOTEL",
  paymentStatus: "NOT_REQUIRED",
  allUnitsAssigned: true,
  ...changes,
});
const actions: ReservationAction[] = [
  "CANCEL_UNPAID",
  "CHECK_IN",
  "CHECK_OUT",
  "MARK_NO_SHOW",
];

describe("T-PAY-1…4: M9 payment and approved-cancellation transitions", () => {
  const online = (changes: Partial<ReservationState> = {}) =>
    state({
      paymentMethod: "ONLINE",
      paymentStatus: "AWAITING",
      status: "AWAITING_PAYMENT",
      ...changes,
    });
  const today = day("2026-11-10");
  const m9Actions: ReservationAction[] = [
    "PAYMENT_SUCCEEDED",
    "HOLD_EXPIRED",
    "CONFIRM_LATE_PAYMENT",
    "CANCEL_APPROVED",
  ];
  const allowedTarget: Record<string, string | undefined> = {
    "AWAITING_PAYMENT:PAYMENT_SUCCEEDED": "CONFIRMED",
    "AWAITING_PAYMENT:HOLD_EXPIRED": "PAYMENT_FAILED",
    "PAYMENT_FAILED:CONFIRM_LATE_PAYMENT": "CONFIRMED",
    "CONFIRMED:CANCEL_APPROVED": "CANCELLED",
  };
  it.each(RESERVATION_STATUSES)(
    "admits only the documented payment transitions from %s (online booking)",
    (status) => {
      for (const action of m9Actions) {
        const result = ReservationStateMachine.transition(
          online({ status, paymentStatus: "REFUNDED" }),
          action,
          today,
        );
        const target = allowedTarget[`${status}:${action}`];
        expect(result.allowed).toBe(Boolean(target));
        if (result.allowed) {
          expect(result.status).toBe(target);
          expect(result.consumesInventory).toBe(target === "CONFIRMED");
        }
      }
    },
  );
  it("never applies payment transitions to pay-at-hotel bookings", () => {
    for (const status of ["AWAITING_PAYMENT", "PAYMENT_FAILED"] as const)
      for (const action of [
        "PAYMENT_SUCCEEDED",
        "HOLD_EXPIRED",
        "CONFIRM_LATE_PAYMENT",
      ] as const)
        expect(
          ReservationStateMachine.transition(
            state({ status, paymentMethod: "PAY_AT_HOTEL" }),
            action,
            today,
          ).allowed,
        ).toBe(false);
  });
  it("CX-5: approved cancellation pairs the payment method with the payment state", () => {
    const attempt = (
      paymentMethod: ReservationState["paymentMethod"],
      paymentStatus: ReservationState["paymentStatus"],
    ) =>
      ReservationStateMachine.transition(
        state({ paymentMethod, paymentStatus }),
        "CANCEL_APPROVED",
        today,
      ).allowed;
    // Unpaid pay-at-hotel cancels at once; paid online only after the refund.
    expect(attempt("PAY_AT_HOTEL", "NOT_REQUIRED")).toBe(true);
    expect(attempt("ONLINE", "REFUNDED")).toBe(true);
    for (const method of ["PAY_AT_HOTEL", "ONLINE"] as const)
      for (const status of RESERVATION_PAYMENT_STATUSES)
        if (
          !(
            (method === "PAY_AT_HOTEL" && status === "NOT_REQUIRED") ||
            (method === "ONLINE" && status === "REFUNDED")
          )
        )
          expect(attempt(method, status)).toBe(false);
  });
});

describe("T-LIFE: pure M8 lifecycle", () => {
  it.each(RESERVATION_SOURCES)(
    "creates %s pay-at-hotel reservations as confirmed, never payment holds",
    (source) => {
      expect(ReservationStateMachine.create(source, "PAY_AT_HOTEL")).toEqual({
        allowed: true,
        status: "CONFIRMED",
        consumesInventory: true,
      });
    },
  );
  it("PY-1, PY-2: only website guests prepay, and the booking awaits payment", () => {
    expect(ReservationStateMachine.create("WEBSITE", "ONLINE")).toEqual({
      allowed: true,
      status: "AWAITING_PAYMENT",
      consumesInventory: true,
    });
    for (const source of ["STAFF", "EXTERNAL"] as const)
      expect(ReservationStateMachine.create(source, "ONLINE")).toEqual({
        allowed: false,
        code: "PAYMENT_METHOD_UNAVAILABLE",
      });
  });
  it.each(RESERVATION_STATUSES)(
    "checks every M8 action from %s without reversals",
    (status) => {
      for (const action of actions) {
        const result = ReservationStateMachine.transition(
          state({ status }),
          action,
          day("2026-11-16"),
        );
        const allowed =
          (status === "CONFIRMED" && action !== "CHECK_OUT") ||
          (status === "CHECKED_IN" && action === "CHECK_OUT");
        expect(result.allowed).toBe(allowed);
        if (!allowed)
          expect(result).toEqual({
            allowed: false,
            code: "INVALID_TRANSITION",
            status,
          });
      }
    },
  );
  it.each(["CHECK_IN", "MARK_NO_SHOW"] as const)(
    "refuses %s before arrival, admits on arrival",
    (action) => {
      expect(
        ReservationStateMachine.transition(state(), action, day("2026-11-14"))
          .allowed,
      ).toBe(false);
      expect(
        ReservationStateMachine.transition(state(), action, day("2026-11-15"))
          .allowed,
      ).toBe(true);
    },
  );
  it("requires an assignment for every unit before check-in", () => {
    expect(
      ReservationStateMachine.transition(
        state({ allUnitsAssigned: false }),
        "CHECK_IN",
        day("2026-11-15"),
      ).allowed,
    ).toBe(false);
  });
  it("refuses paid or payment-related cancellation through the unpaid path", () => {
    for (const paymentStatus of [
      "AWAITING",
      "PAID",
      "REFUND_PENDING",
      "REFUNDED",
    ] as const)
      expect(
        ReservationStateMachine.transition(
          state({ paymentStatus }),
          "CANCEL_UNPAID",
          day("2026-11-15"),
        ).allowed,
      ).toBe(false);
    expect(
      ReservationStateMachine.transition(
        state({ paymentMethod: "ONLINE" }),
        "CANCEL_UNPAID",
        day("2026-11-15"),
      ).allowed,
    ).toBe(false);
  });
  it("Q-79 refuses arrival-day checkout, leaves the input unchanged", () => {
    const original = Object.freeze(state({ status: "CHECKED_IN" }));
    expect(
      ReservationStateMachine.transition(
        original,
        "CHECK_OUT",
        day("2026-11-15"),
      ),
    ).toEqual({
      allowed: false,
      code: "INVALID_TRANSITION",
      status: "CHECKED_IN",
    });
    expect(original.stay.checkOut.value).toBe("2026-11-18");
  });
  it("IN-3 shortens early departure but retains historical consumption and changes no price fields", () => {
    const original = state({ status: "CHECKED_IN" });
    const result = ReservationStateMachine.transition(
      original,
      "CHECK_OUT",
      day("2026-11-16"),
    );
    expect(result).toMatchObject({
      allowed: true,
      status: "CHECKED_OUT",
      consumesInventory: true,
    });
    if (!result.allowed) throw new Error("Expected checkout");
    expect(result.stay.checkOut.value).toBe("2026-11-16");
    expect(original.stay).toBe(stay);
    expect(Object.keys(result).sort()).toEqual([
      "allowed",
      "consumesInventory",
      "status",
      "stay",
    ]);
  });
  it.each(["2026-11-18", "2026-11-19"])(
    "does not extend a stay for checkout on %s",
    (date) => {
      const result = ReservationStateMachine.transition(
        state({ status: "CHECKED_IN" }),
        "CHECK_OUT",
        day(date),
      );
      expect(result.allowed && result.stay).toBe(stay);
    },
  );
  it.each(RESERVATION_STATUSES)(
    "derives consumption and editing restrictions for %s",
    (status) => {
      expect(consumesInventory(status)).toBe(
        ["AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(
          status,
        ),
      );
      const terminal = [
        "PAYMENT_FAILED",
        "CANCELLED",
        "CHECKED_OUT",
        "NO_SHOW",
      ].includes(status);
      expect(isTerminalReservation(status)).toBe(terminal);
      expect(canEditReservationGuest(status)).toBe(!terminal);
      expect(canModifyReservationStay(status)).toBe(status === "CONFIRMED");
    },
  );
  it("rejects unsupported statuses even at an untyped boundary", () => {
    for (const status of ["PENDING", "DECLINED", "other"])
      expect(() => consumesInventory(status as never)).toThrow(
        DomainValidationError,
      );
  });
});
