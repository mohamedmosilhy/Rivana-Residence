import { describe, expect, it } from "vitest";

import {
  AvailabilityCalculator,
  type NightInventory,
} from "@/domain/inventory";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";

const date = (value: string) => LocalDate.parse(value);
const stay = StayRange.create(date("2026-09-14"), date("2026-09-17"));
const row = (day: number, capacity = 4, sold = 2): NightInventory => ({
  night: date(`2026-09-${day}`),
  capacity,
  sold,
});

describe("AvailabilityCalculator (T-AV, AC-6)", () => {
  it("requires the requested quantity on every night and excludes checkout", () => {
    const result = AvailabilityCalculator.check({
      stay,
      quantity: 2,
      nights: [row(16), row(14), row(15), row(17, 0, 0)],
    });
    expect(result.available).toBe(true);
    expect(
      result.nights.map((night) => [night.night.value, night.free]),
    ).toEqual([
      ["2026-09-14", 2],
      ["2026-09-15", 2],
      ["2026-09-16", 2],
    ]);
  });

  it("reports the earliest insufficient middle night despite unsorted counts", () => {
    const result = AvailabilityCalculator.check({
      stay,
      quantity: 2,
      nights: [row(16, 3, 3), row(14), row(15, 4, 3)],
    });
    expect(result).toMatchObject({
      available: false,
      firstUnavailableNight: date("2026-09-15"),
    });
  });

  it("treats missing inventory dates as zero capacity and zero sold", () => {
    const result = AvailabilityCalculator.check({
      stay,
      quantity: 1,
      nights: [row(14), row(16)],
    });
    expect(result).toMatchObject({
      available: false,
      firstUnavailableNight: date("2026-09-15"),
    });
    expect(result.nights[1]).toEqual({
      night: date("2026-09-15"),
      capacity: 0,
      sold: 0,
      free: 0,
    });
  });

  it("makes an empty listing unavailable from checkin", () => {
    expect(
      AvailabilityCalculator.check({ stay, quantity: 1, nights: [] }),
    ).toMatchObject({
      available: false,
      firstUnavailableNight: stay.checkIn,
    });
  });

  it("preserves an oversold negative free count instead of clamping it", () => {
    const result = AvailabilityCalculator.check({
      stay,
      quantity: 1,
      nights: [row(14, 1, 3)],
    });
    expect(result.available).toBe(false);
    expect(result.nights[0]?.free).toBe(-2);
  });

  it("allows all unblocked capacity when sold is zero", () => {
    expect(
      AvailabilityCalculator.check({
        stay,
        quantity: 4,
        nights: [row(14, 4, 0), row(15, 4, 0), row(16, 4, 0)],
      }).available,
    ).toBe(true);
  });

  it("does not impose the later public API quantity cap on domain arithmetic", () => {
    expect(
      AvailabilityCalculator.check({
        stay,
        quantity: 6,
        nights: [row(14, 6, 0), row(15, 6, 0), row(16, 6, 0)],
      }).available,
    ).toBe(true);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(() =>
        AvailabilityCalculator.check({ stay, quantity, nights: [] }),
      ).toThrow(DomainValidationError);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid counts %s",
    (count) => {
      for (const counts of [row(14, count, 0), row(14, 1, count)]) {
        expect(() =>
          AvailabilityCalculator.check({ stay, quantity: 1, nights: [counts] }),
        ).toThrow(DomainValidationError);
      }
    },
  );

  it("rejects duplicate night rows instead of guessing an aggregate", () => {
    expect(() =>
      AvailabilityCalculator.check({
        stay,
        quantity: 1,
        nights: [row(14), row(14)],
      }),
    ).toThrow(DomainValidationError);
  });

  it("copies and freezes results without retaining mutable count records", () => {
    const counts = { night: stay.checkIn, capacity: 4, sold: 0 };
    const nights = [counts];
    const result = AvailabilityCalculator.check({ stay, quantity: 1, nights });
    counts.capacity = 0;
    nights.length = 0;
    expect(result.nights[0]?.capacity).toBe(4);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nights)).toBe(true);
    expect(Object.isFrozen(result.nights[0])).toBe(true);
  });
});
