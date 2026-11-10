import { describe, expect, it } from "vitest";

import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import {
  DEFAULT_STAY_POLICY,
  validatePublicStay,
} from "@/domain/shared/stay-policy";
import { StayRange } from "@/domain/shared/stay-range";
import { localDateAt } from "@/domain/shared/zoned-time";

const today = LocalDate.parse("2026-11-08");
const stayAt = (daysAhead: number, nights: number) => {
  const checkIn = today.addDays(daysAhead);
  return StayRange.create(checkIn, checkIn.addDays(nights));
};

describe("public stay policy (AC-3, T-DATE-6 through T-DATE-8)", () => {
  it.each([1, 30])("allows a same-day stay of %i nights", (nights) => {
    expect(validatePublicStay(stayAt(0, nights), today)).toEqual([]);
  });

  it("rejects 31 nights while leaving the structural range valid", () => {
    const stay = stayAt(0, 31);
    expect(stay.nightCount).toBe(31);
    expect(validatePublicStay(stay, today).map((issue) => issue.path)).toEqual([
      "checkOut",
    ]);
  });

  it("rejects public check-in before the branch's today", () => {
    expect(
      validatePublicStay(stayAt(-1, 1), today).map((issue) => issue.path),
    ).toEqual(["checkIn"]);
  });

  it("allows check-in exactly 540 days ahead even when check-out is later", () => {
    expect(validatePublicStay(stayAt(540, 30), today)).toEqual([]);
  });

  it("rejects check-in 541 days ahead", () => {
    expect(
      validatePublicStay(stayAt(541, 1), today).map((issue) => issue.path),
    ).toEqual(["checkIn"]);
  });

  it("uses the supplied policy without changing the accepted defaults", () => {
    const policy = { maxStayNights: 45, bookingHorizonDays: 600 };
    expect(validatePublicStay(stayAt(600, 45), today, policy)).toEqual([]);
    expect(DEFAULT_STAY_POLICY).toEqual({
      maxStayNights: 30,
      bookingHorizonDays: 540,
    });
  });

  it("supports a configuration that permits only same-day arrivals", () => {
    const policy = { maxStayNights: 30, bookingHorizonDays: 0 };
    expect(validatePublicStay(stayAt(0, 1), today, policy)).toEqual([]);
    expect(validatePublicStay(stayAt(1, 1), today, policy)).toHaveLength(1);
  });

  it.each([
    { maxStayNights: 0, bookingHorizonDays: 540 },
    { maxStayNights: -1, bookingHorizonDays: 540 },
    { maxStayNights: 1.5, bookingHorizonDays: 540 },
    { maxStayNights: Infinity, bookingHorizonDays: 540 },
    { maxStayNights: 30, bookingHorizonDays: -1 },
    { maxStayNights: 30, bookingHorizonDays: NaN },
    { maxStayNights: 30, bookingHorizonDays: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid configuration %j", (policy) => {
    expect(() => validatePublicStay(stayAt(0, 1), today, policy)).toThrow(
      DomainValidationError,
    );
  });

  it("validates near the last supported date without adding the horizon to today", () => {
    const lastToday = LocalDate.parse("9999-12-30");
    const stay = StayRange.create(lastToday, LocalDate.parse("9999-12-31"));
    expect(validatePublicStay(stay, lastToday)).toEqual([]);
  });

  it("uses the branch zone rather than the server's UTC date", () => {
    const clock = { now: () => new Date("2026-09-25T21:05:00Z") };
    const stay = StayRange.create(
      LocalDate.parse("2026-09-25"),
      LocalDate.parse("2026-09-26"),
    );
    expect(validatePublicStay(stay, localDateAt(clock.now(), "UTC"))).toEqual(
      [],
    );
    expect(
      validatePublicStay(stay, localDateAt(clock.now(), "Africa/Cairo")),
    ).toHaveLength(1);
  });
});
