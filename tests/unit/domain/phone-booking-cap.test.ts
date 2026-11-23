import { describe, expect, it } from "vitest";
import {
  PhoneNumber,
  checkPhoneBookingLimit,
  type PhoneBooking,
} from "@/domain/guests";
import { LocalDate } from "@/domain/shared/local-date";
import { localDateAt } from "@/domain/shared/zoned-time";
import { DomainValidationError } from "@/domain/shared/domain-error";
const phone = PhoneNumber.parse("+12025550101");
const now = new Date("2026-11-15T22:30:00Z");
const row = (id: string, patch: Partial<PhoneBooking> = {}): PhoneBooking => ({
  id,
  phone,
  source: "WEBSITE",
  status: "CONFIRMED",
  paymentMethod: "PAY_AT_HOTEL",
  checkIn: LocalDate.parse("2026-11-15"),
  branchToday: LocalDate.parse("2026-11-15"),
  holdExpiresAt: null,
  ...patch,
});

describe("Q-60/78/81 global booking caps", () => {
  it.each([0, 1, 2, 3])(
    "permits fewer than two upcoming website bookings, supplied count %s",
    (size) => {
      expect(
        checkPhoneBookingLimit(
          phone,
          Array.from({ length: size }, (_, index) => row(String(index))),
          "PAY_AT_HOTEL",
          now,
        ).allowed,
      ).toBe(size < 2);
    },
  );
  it("counts across branches using each branch's own today, including arrival today", () => {
    const cairo = localDateAt(now, "Africa/Cairo"),
      la = localDateAt(now, "America/Los_Angeles");
    expect(cairo.value).toBe("2026-11-16");
    expect(la.value).toBe("2026-11-15");
    const bookings = [
      row("cairo", { branchToday: cairo }),
      row("la", { branchToday: la }),
      row("future", {
        checkIn: LocalDate.parse("2026-11-17"),
        branchToday: cairo,
      }),
    ];
    expect(
      checkPhoneBookingLimit(phone, bookings, "PAY_AT_HOTEL", now),
    ).toEqual({ allowed: false, code: "BOOKING_LIMIT_REACHED" });
    expect(
      checkPhoneBookingLimit(phone, bookings.slice(0, 2), "PAY_AT_HOTEL", now),
    ).toEqual({ allowed: true });
  });
  it("excludes staff, external, past arrivals, other phones, terminal and checked-in records", () => {
    const bookings: PhoneBooking[] = [
      row("staff", { source: "STAFF" }),
      row("external", { source: "EXTERNAL" }),
      row("past", { checkIn: LocalDate.parse("2026-11-14") }),
      row("other", { phone: PhoneNumber.parse("+12025550102") }),
      ...(
        [
          "CHECKED_IN",
          "CHECKED_OUT",
          "CANCELLED",
          "PAYMENT_FAILED",
          "NO_SHOW",
        ] as const
      ).map((status) => row(status, { status })),
    ];
    expect(
      checkPhoneBookingLimit(phone, bookings, "PAY_AT_HOTEL", now),
    ).toEqual({ allowed: true });
  });
  it("defines future ONLINE holds separately, excluding expired holds at the exact expiry instant", () => {
    const hold = row("hold", {
      status: "AWAITING_PAYMENT",
      paymentMethod: "ONLINE",
      holdExpiresAt: new Date(now.getTime() + 1),
    });
    expect(checkPhoneBookingLimit(phone, [hold], "ONLINE", now)).toEqual({
      allowed: false,
      code: "BOOKING_LIMIT_REACHED",
    });
    expect(checkPhoneBookingLimit(phone, [hold], "PAY_AT_HOTEL", now)).toEqual({
      allowed: true,
    });
    expect(
      checkPhoneBookingLimit(
        phone,
        [{ ...hold, holdExpiresAt: now }],
        "ONLINE",
        now,
      ),
    ).toEqual({ allowed: true });
  });
  it("rejects duplicate records, invalid dates and a hold without expiry without mutating inputs", () => {
    const original = Object.freeze(row("a"));
    expect(() =>
      checkPhoneBookingLimit(phone, [original, original], "PAY_AT_HOTEL", now),
    ).toThrow(DomainValidationError);
    expect(() =>
      checkPhoneBookingLimit(
        phone,
        [row("b", { status: "AWAITING_PAYMENT", paymentMethod: "ONLINE" })],
        "ONLINE",
        now,
      ),
    ).toThrow(DomainValidationError);
    expect(() =>
      checkPhoneBookingLimit(phone, [], "PAY_AT_HOTEL", new Date("bad")),
    ).toThrow(DomainValidationError);
    expect(original.status).toBe("CONFIRMED");
  });
});
