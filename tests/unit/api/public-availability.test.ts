// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  availabilityInput,
  duplicateAvailabilityFields,
} from "@/app/api/v1/_query/availability";
import {
  AvailabilityQuery,
  AvailabilityResponse,
} from "@/contracts/api/v1/availability";

const query = {
  checkIn: "2031-03-10",
  checkOut: "2031-03-14",
  adults: "2",
  children: "0",
};

describe("P5 contracts and parsing (AC-1, AC-6, AC-8)", () => {
  it("accepts transport strings while semantic failures remain for 422", () => {
    expect(availabilityInput(AvailabilityQuery.parse(query))).toEqual({
      ...query,
      adults: 2,
      children: 0,
    });
    expect(
      AvailabilityQuery.safeParse({
        ...query,
        checkIn: "not-a-date",
        unitsRequested: "6",
      }).success,
    ).toBe(true);
    expect(
      availabilityInput({ ...query, unitsRequested: "6" }).unitsRequested,
    ).toBe(6);
  });
  it.each(["", " ", "no", "NaN"])(
    "never converts invalid numeric %j into zero",
    (value) => {
      const result = availabilityInput({
        ...query,
        children: value,
        unitsRequested: value,
      });
      expect(result.children).toBeNaN();
      expect(result.unitsRequested).toBeNaN();
    },
  );
  it("rejects unknown and missing query parameters", () => {
    expect(
      AvailabilityQuery.safeParse({ ...query, branchId: "other" }).success,
    ).toBe(false);
    const missing = {
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      adults: query.adults,
    };
    expect(AvailabilityQuery.safeParse(missing).success).toBe(false);
  });
  it("rejects duplicate parameters even when their values agree", () => {
    expect(
      duplicateAvailabilityFields(
        new Request("http://localhost/?adults=2&adults=2"),
      ),
    ).toEqual({ adults: ["Supply this parameter once."] });
    expect(
      duplicateAvailabilityFields(new Request("http://localhost/?adults=2")),
    ).toBeNull();
  });
  it("rejects extra top-level disclosure", () => {
    expect(
      AvailabilityResponse.safeParse({
        stay: { checkIn: query.checkIn, checkOut: query.checkOut },
        occupancy: { adults: 2, children: 0 },
        results: [],
        capacity: 5,
      }).success,
    ).toBe(false);
  });
});
