import { describe, expect, it } from "vitest";

import {
  MAX_UNITS_REQUESTED,
  parseAvailabilitySearch,
} from "@/domain/inventory";

const valid = {
  checkIn: "2027-06-10",
  checkOut: "2027-06-13",
  adults: 2,
  children: 0,
};

function issuePaths(input: unknown) {
  const parsed = parseAvailabilitySearch(input);
  return parsed.ok ? [] : parsed.issues.map((issue) => issue.path);
}

describe("parseAvailabilitySearch", () => {
  it("defaults the quantity to one and keeps the stay and occupancy", () => {
    const parsed = parseAvailabilitySearch(valid);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.unitsRequested).toBe(1);
    expect(parsed.value.stay.nightCount).toBe(3);
    expect(parsed.value.occupancy.adults).toBe(2);
  });

  it("accepts the documented maximum quantity and refuses one more", () => {
    expect(
      parseAvailabilitySearch({ ...valid, unitsRequested: MAX_UNITS_REQUESTED })
        .ok,
    ).toBe(true);
    expect(
      issuePaths({ ...valid, unitsRequested: MAX_UNITS_REQUESTED + 1 }),
    ).toEqual(["unitsRequested"]);
    expect(issuePaths({ ...valid, unitsRequested: 0 })).toEqual([
      "unitsRequested",
    ]);
    expect(issuePaths({ ...valid, unitsRequested: 1.5 })).toEqual([
      "unitsRequested",
    ]);
  });

  it("reports impossible dates and non positive stays as field issues", () => {
    expect(issuePaths({ ...valid, checkIn: "2027-02-30" })).toEqual([
      "checkIn",
    ]);
    expect(issuePaths({ ...valid, checkOut: "2027-06-10" })).toEqual([
      "checkOut",
    ]);
    expect(issuePaths({ ...valid, checkOut: "2027-06-09" })).toEqual([
      "checkOut",
    ]);
  });

  it("validates occupancy counts", () => {
    expect(issuePaths({ ...valid, adults: 0 })).toEqual(["adults"]);
    expect(issuePaths({ ...valid, children: -1 })).toEqual(["children"]);
    expect(issuePaths({ ...valid, adults: 1.5 })).toEqual(["adults"]);
  });

  it("refuses strings and unknown keys instead of coercing them", () => {
    expect(issuePaths({ ...valid, adults: "2" })).toEqual(["adults"]);
    expect(parseAvailabilitySearch({ ...valid, extra: 1 }).ok).toBe(false);
    expect(parseAvailabilitySearch(null).ok).toBe(false);
  });
});
