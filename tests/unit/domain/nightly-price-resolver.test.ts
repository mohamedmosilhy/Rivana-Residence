import { describe, expect, it } from "vitest";

import { NightlyPriceResolver, type DateRatePeriod } from "@/domain/pricing";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { StayRange } from "@/domain/shared/stay-range";

const range = (from: string, to: string) =>
  StayRange.create(LocalDate.parse(from), LocalDate.parse(to));
const usd = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });
const stay = range("2026-09-14", "2026-09-18");
const period = (
  id: string,
  from: string,
  to: string,
  amount = 7000,
  active = true,
): DateRatePeriod => ({
  id,
  range: range(from, to),
  amount: usd(amount),
  active,
  label: id,
});
const periods = [
  period("first", "2026-09-14", "2026-09-16", 6000),
  period("second", "2026-09-16", "2026-09-18"),
];

describe("NightlyPriceResolver (AC-1, AC-3, AC-6, applicable T-PR)", () => {
  it("resolves the four night worked example to exactly 26000 cents", () => {
    const result = NightlyPriceResolver.resolve({
      stay,
      baseRate: usd(5000),
      periods: [...periods].reverse(),
    });
    expect(result.priced).toBe(true);
    expect(result.accommodationTotal?.amountMinor).toBe(26000);
    expect(
      result.nights.map((night) => [
        night.night.value,
        night.amount?.amountMinor,
        night.source,
        night.periodId,
        night.label,
      ]),
    ).toEqual([
      ["2026-09-14", 6000, "PERIOD", "first", "first"],
      ["2026-09-15", 6000, "PERIOD", "first", "first"],
      ["2026-09-16", 7000, "PERIOD", "second", "second"],
      ["2026-09-17", 7000, "PERIOD", "second", "second"],
    ]);
  });

  it("multiplies the complete accommodation sum by the requested quantity", () => {
    const result = NightlyPriceResolver.resolve({
      stay,
      baseRate: null,
      periods,
      quantity: 2,
    });
    expect(result.accommodationTotal?.amountMinor).toBe(52000);
    expect(result.nights[0]?.amount?.amountMinor).toBe(6000);
  });

  it("falls back to base outside a half open active period", () => {
    const result = NightlyPriceResolver.resolve({
      stay,
      baseRate: usd(5000),
      periods: [period("middle", "2026-09-15", "2026-09-17")],
    });
    expect(
      result.nights.map((night) => [
        night.amount?.amountMinor,
        night.source,
        night.periodId,
      ]),
    ).toEqual([
      [5000, "BASE", null],
      [7000, "PERIOD", "middle"],
      [7000, "PERIOD", "middle"],
      [5000, "BASE", null],
    ]);
    expect(result.accommodationTotal?.amountMinor).toBe(24000);
  });

  it("ignores inactive overlapping periods and retains the base price", () => {
    const result = NightlyPriceResolver.resolve({
      stay,
      baseRate: usd(5000),
      periods: [
        period("inactive", "2026-09-14", "2026-09-18", 100, false),
        ...periods,
      ],
    });
    expect(result.accommodationTotal?.amountMinor).toBe(26000);
  });

  it("prices a stay with no base if periods cover every night", () => {
    expect(
      NightlyPriceResolver.resolve({ stay, baseRate: null, periods }).priced,
    ).toBe(true);
  });

  it("marks a partial gap explicitly and never returns a partial accommodation total", () => {
    const result = NightlyPriceResolver.resolve({
      stay,
      baseRate: null,
      periods: [periods[0]!],
    });
    expect(result).toMatchObject({
      priced: false,
      firstUnpricedNight: LocalDate.parse("2026-09-16"),
      accommodationTotal: null,
    });
    expect(result.nights[2]).toMatchObject({
      amount: null,
      source: null,
      periodId: null,
      label: null,
    });
    expect(result.nights).toHaveLength(4);
  });

  it("marks all nights unpriced when both base and periods are absent", () => {
    const result = NightlyPriceResolver.resolve({
      stay,
      baseRate: null,
      periods: [],
    });
    expect(result).toMatchObject({
      priced: false,
      firstUnpricedNight: stay.checkIn,
      accommodationTotal: null,
    });
    expect(result.nights.every((night) => night.amount === null)).toBe(true);
  });

  it.each([
    ["2026-09-13", "2026-09-15"],
    ["2026-09-15", "2026-09-17"],
    ["2026-09-15", "2026-09-16"],
    ["2026-09-13", "2026-09-19"],
    ["2026-09-14", "2026-09-16"],
  ])(
    "rejects ambiguous active overlap %s to %s without choosing precedence",
    (from, to) => {
      expect(() =>
        NightlyPriceResolver.resolve({
          stay,
          baseRate: usd(5000),
          periods: [period("other", from, to), periods[0]!],
        }),
      ).toThrow(DomainValidationError);
    },
  );

  it("rejects duplicate period identities", () => {
    expect(() =>
      NightlyPriceResolver.resolve({
        stay,
        baseRate: null,
        periods: [periods[0]!, periods[0]!],
      }),
    ).toThrow(DomainValidationError);
  });

  it("rejects zero authored base and period rates even though zero Money is valid", () => {
    expect(() =>
      NightlyPriceResolver.resolve({ stay, baseRate: usd(0), periods: [] }),
    ).toThrow(DomainValidationError);
    expect(() =>
      NightlyPriceResolver.resolve({
        stay,
        baseRate: null,
        periods: [period("zero", "2026-09-14", "2026-09-18", 0)],
      }),
    ).toThrow(DomainValidationError);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(() =>
        Reflect.apply(NightlyPriceResolver.resolve, NightlyPriceResolver, [
          { stay, baseRate: usd(5000), periods, quantity },
        ]),
      ).toThrow(DomainValidationError);
    },
  );

  it("checks safe integer overflow for both summing and quantity multiplication", () => {
    expect(() =>
      NightlyPriceResolver.resolve({
        stay,
        baseRate: usd(Number.MAX_SAFE_INTEGER),
        periods: [],
      }),
    ).toThrow(DomainValidationError);
    expect(() =>
      NightlyPriceResolver.resolve({
        stay: range("2026-09-14", "2026-09-15"),
        baseRate: usd(Number.MAX_SAFE_INTEGER),
        periods: [],
        quantity: 2,
      }),
    ).toThrow(DomainValidationError);
  });

  it("returns unpriced without calculating an overflowing partial total", () => {
    expect(
      NightlyPriceResolver.resolve({
        stay,
        baseRate: null,
        periods: [
          period("large", "2026-09-14", "2026-09-16", Number.MAX_SAFE_INTEGER),
        ],
      }),
    ).toMatchObject({ priced: false, accommodationTotal: null });
  });

  it("keeps resolved amounts and labels immutable after the caller edits its period records", () => {
    const mutable = { ...periods[0]! };
    const inputPeriods = [mutable];
    const result = NightlyPriceResolver.resolve({
      stay,
      baseRate: usd(5000),
      periods: inputPeriods,
    });
    mutable.label = "changed";
    mutable.amount = usd(1);
    inputPeriods.length = 0;
    expect(result.nights[0]).toMatchObject({
      label: "first",
      amount: usd(6000),
    });
    expect(result.accommodationTotal?.amountMinor).toBe(22000);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nights)).toBe(true);
    expect(Object.isFrozen(result.nights[0])).toBe(true);
    expect(Object.isFrozen(result.nights[0]?.amount)).toBe(true);
  });
});
