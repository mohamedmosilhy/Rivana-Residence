import { describe, expect, it } from "vitest";

import { parseCommercialSettingsInput } from "@/domain/settings/vat-rate";

// T-TAX-3, T-TAX-4 (domain side): the rate is an integer 0 to 10000 basis
// points and is never null (Q-05 amended).
describe("parseCommercialSettingsInput", () => {
  it.each([0, 1, 1500, 9999, 10_000])("accepts %i", (value) => {
    expect(parseCommercialSettingsInput({ vatRateBasisPoints: value })).toEqual(
      { ok: true, value: { vatRateBasisPoints: value } },
    );
  });

  it.each([
    ["below zero", -1],
    ["above 100%", 10_001],
    ["fractional", 1500.5],
    ["null", null],
    ["a string", "1500"],
    ["NaN", Number.NaN],
    ["missing", undefined],
  ])("refuses %s", (_label, value) => {
    const result = parseCommercialSettingsInput({ vatRateBasisPoints: value });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe("vatRateBasisPoints");
    }
  });

  it("refuses an empty body and unknown keys", () => {
    expect(parseCommercialSettingsInput({}).ok).toBe(false);
    expect(parseCommercialSettingsInput(null).ok).toBe(false);
    expect(
      parseCommercialSettingsInput({ vatRateBasisPoints: 1500, extra: 1 }).ok,
    ).toBe(false);
  });
});
