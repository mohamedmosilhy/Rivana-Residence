import { describe, expect, it } from "vitest";

import { formatMoney } from "@/presentation/format/money";

describe("formatMoney", () => {
  it.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [12_345, "$123.45"],
    [123_456_789, "$1,234,567.89"],
    [-1_000, "-$10.00"],
  ])("shows %i cents as %s", (minor, text) => {
    expect(formatMoney(minor)).toBe(text);
  });

  it("accepts an API Money value", () => {
    expect(formatMoney({ amountMinor: 34_500, currency: "USD" })).toBe(
      "$345.00",
    );
  });
});
