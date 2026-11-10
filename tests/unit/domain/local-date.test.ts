import { describe, expect, it } from "vitest";

import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";

describe("LocalDate (AC-3, T-DATE-1 and T-DATE-2)", () => {
  it.each([
    "0001-01-01",
    "0099-12-31",
    "2000-02-29",
    "2028-02-29",
    "9999-12-31",
  ])("preserves the canonical calendar date %s", (value) => {
    const date = LocalDate.parse(value);
    expect(date.toString()).toBe(value);
    expect(date.value).toBe(value);
  });

  it.each([
    undefined,
    null,
    20260101,
    {},
    "",
    "2026-1-01",
    "2026-01-1",
    " 2026-01-01",
    "2026-01-01 ",
    "2026-01-01\n",
    "2026-01-01T00:00:00Z",
    "2027-02-29",
    "1900-02-29",
    "2100-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    "0000-01-01",
    "10000-01-01",
    "２０２６-０１-０１",
  ])("rejects malformed or impossible date %j", (value) => {
    expect(() => LocalDate.parse(value)).toThrow(DomainValidationError);
  });

  it.each([
    ["2026-12-31", "2027-01-01", -1, 1],
    ["2028-02-28", "2028-03-01", -1, 2],
    ["2026-01-01", "2026-01-01", 0, 0],
    ["2027-01-01", "2026-12-31", 1, -1],
  ] as const)("compares %s with %s", (from, to, order, days) => {
    const left = LocalDate.parse(from);
    const right = LocalDate.parse(to);
    expect(left.compare(right)).toBe(order);
    expect(left.daysUntil(right)).toBe(days);
  });

  it.each([
    ["2026-01-31", 1, "2026-02-01"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2028-02-28", 2, "2028-03-01"],
    ["2000-03-01", -1, "2000-02-29"],
    ["1900-02-28", 1, "1900-03-01"],
    ["0099-12-31", 1, "0100-01-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-01-01", 146097, "2426-01-01"],
    ["2426-01-01", -146097, "2026-01-01"],
    ["0001-01-01", 3652058, "9999-12-31"],
    ["9999-12-31", -3652058, "0001-01-01"],
  ] as const)("shifts %s by %i calendar days", (from, offset, expected) => {
    const original = LocalDate.parse(from);
    expect(original.addDays(offset).toString()).toBe(expected);
    expect(original.toString()).toBe(from);
  });

  it("agrees with an independent UTC oracle at every month boundary in a 400 year cycle", () => {
    // Date is an independent test oracle only, never the production arithmetic.
    for (let year = 2000; year < 2400; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const first = `${year}-${String(month).padStart(2, "0")}-01`;
        const previous = new Date(Date.UTC(year, month - 1, 0))
          .toISOString()
          .slice(0, 10);
        expect(LocalDate.parse(first).addDays(-1).toString()).toBe(previous);
      }
    }
  });

  it.each([0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid day offset %s",
    (offset) => {
      expect(() => LocalDate.parse("2026-01-01").addDays(offset)).toThrow(
        DomainValidationError,
      );
    },
  );

  it("rejects shifts outside the four digit Gregorian date range", () => {
    expect(() => LocalDate.parse("0001-01-01").addDays(-1)).toThrow(
      DomainValidationError,
    );
    expect(() => LocalDate.parse("9999-12-31").addDays(1)).toThrow(
      DomainValidationError,
    );
  });

  it("returns an equal new value for a zero day shift", () => {
    const original = LocalDate.parse("2026-01-01");
    const shifted = original.addDays(0);
    expect(shifted).not.toBe(original);
    expect(shifted.compare(original)).toBe(0);
  });
});
