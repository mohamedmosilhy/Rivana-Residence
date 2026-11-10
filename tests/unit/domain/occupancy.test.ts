import { describe, expect, it } from "vitest";

import { DomainValidationError } from "@/domain/shared/domain-error";
import { Occupancy } from "@/domain/shared/occupancy";

describe("Occupancy (AC-3, OC-1 and OC-2)", () => {
  it("accepts one adult with no children", () => {
    expect(Occupancy.create({ adults: 1, children: 0 })).toMatchObject({
      adults: 1,
      children: 0,
    });
  });

  it.each([
    null,
    {},
    { adults: 0, children: 0 },
    { adults: -1, children: 0 },
    { adults: 1.5, children: 0 },
    { adults: Infinity, children: 0 },
    { adults: NaN, children: 0 },
    { adults: Number.MAX_SAFE_INTEGER + 1, children: 0 },
    { adults: 1, children: -1 },
    { adults: 1, children: 0.5 },
    { adults: 1, children: Infinity },
    { adults: 1, children: Number.MAX_SAFE_INTEGER + 1 },
    { adults: "1", children: 0 },
    { adults: 1, children: 0, units: 2 },
  ])("rejects invalid occupancy %j", (input) => {
    expect(() => Occupancy.create(input)).toThrow(DomainValidationError);
  });

  it.each([
    [{ maxAdults: 2, maxChildren: 1 }, true],
    [{ maxAdults: 1, maxChildren: 1 }, false],
    [{ maxAdults: 3, maxChildren: 0 }, false],
    [{ maxAdults: 3, maxChildren: 2 }, true],
  ] as const)("checks both per-unit limits %j", (limits, expected) => {
    expect(Occupancy.create({ adults: 2, children: 1 }).fits(limits)).toBe(
      expected,
    );
  });

  it("does not change when the input object is later changed", () => {
    const input = { adults: 2, children: 1 };
    const occupancy = Occupancy.create(input);
    input.adults = 5;
    expect(occupancy.adults).toBe(2);
  });
});
