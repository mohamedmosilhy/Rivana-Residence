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

describe("T-LIFE: pure M8 lifecycle", () => {
  it.each(RESERVATION_SOURCES)(
    "creates %s pay-at-hotel reservations as confirmed, never payment holds",
    (source) => {
      expect(ReservationStateMachine.create(source, "PAY_AT_HOTEL")).toEqual({
        allowed: true,
        status: "CONFIRMED",
        consumesInventory: true,
      });
      expect(ReservationStateMachine.create(source, "PAYMOB")).toEqual({
        allowed: false,
        code: "PAYMENT_METHOD_UNAVAILABLE",
      });
    },
  );
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
        state({ paymentMethod: "PAYMOB" }),
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
