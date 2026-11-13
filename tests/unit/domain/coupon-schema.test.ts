import { describe, expect, it } from "vitest";
import {
  couponInputData,
  parseCouponInput,
  parseCouponPatch,
} from "@/domain/coupons";

const input = (values: Record<string, unknown> = {}) => ({
  code: "  summer_26 ",
  kind: "PERCENT",
  percentBasisPoints: 1500,
  allBranches: false,
  branchIds: ["b", "a"],
  active: true,
  ...values,
});

describe("coupon authoring", () => {
  it("normalizes codes, optional values, and branch order", () => {
    const result = parseCouponInput(input());
    expect(result).toMatchObject({
      ok: true,
      value: {
        code: "SUMMER_26",
        branchIds: ["a", "b"],
        amount: null,
        description: null,
      },
    });
    if (result.ok)
      expect(parseCouponInput(couponInputData(result.value))).toEqual(result);
  });
  it.each([
    { code: "ab" },
    { code: "éÉe" },
    { code: "A".repeat(33) },
    { kind: "OTHER" },
    { percentBasisPoints: 0 },
    { percentBasisPoints: 10001 },
    { percentBasisPoints: 1.5 },
    { percentBasisPoints: null },
    { amount: { amountMinor: 100, currency: "USD" } },
    {
      kind: "FIXED",
      percentBasisPoints: null,
      amount: { amountMinor: 0, currency: "USD" },
    },
    {
      kind: "FIXED",
      percentBasisPoints: null,
      amount: { amountMinor: 2147483648, currency: "USD" },
    },
    {
      kind: "FIXED",
      percentBasisPoints: null,
      amount: { amountMinor: 10, currency: "EUR" },
    },
    { maxRedemptions: 0 },
    { maxRedemptionsPerPhone: -1 },
    { maxRedemptions: 2147483648 },
    { startsAt: "2026-02-30T12:00:00Z" },
    { startsAt: "2026-11-13" },
    { startsAt: "2026-11-13T10:00:00Z", endsAt: "2026-11-13T12:00:00+02:00" },
    { startsAt: "2026-11-14T00:00:00Z", endsAt: "2026-11-13T00:00:00Z" },
    { branchIds: [] },
    { branchIds: ["a", "a"] },
    { branchIds: [""] },
    { allBranches: true },
    { description: "x".repeat(301) },
    { active: "true" },
    { total: 100 },
  ])("refuses invalid complete state %j", (values) => {
    expect(parseCouponInput(input(values)).ok).toBe(false);
  });
  it.each([1, 10000])("accepts percent boundary %s", (percentBasisPoints) => {
    expect(parseCouponInput(input({ percentBasisPoints })).ok).toBe(true);
  });
  it("accepts fixed USD maximum, global scope, optional limits and UTC instants", () => {
    const result = parseCouponInput(
      input({
        kind: "FIXED",
        percentBasisPoints: null,
        amount: { amountMinor: 2147483647, currency: "USD" },
        allBranches: true,
        branchIds: [],
        maxRedemptions: 1,
        maxRedemptionsPerPhone: 2147483647,
        description: "  note ",
        startsAt: "2026-11-13T12:00:00+02:00",
        endsAt: "2026-11-14T00:00:00Z",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        description: "note",
        startsAt: new Date("2026-11-13T10:00:00Z"),
      },
    });
  });
  it.each([
    {},
    { code: "IMMUTABLE" },
    { totalMinor: 100 },
    { active: null },
    { kind: "INVALID" },
  ])("refuses invalid patch %j", (value) =>
    expect(parseCouponPatch(value).ok).toBe(false),
  );
  it("preserves explicit null and only submitted patch fields", () => {
    expect(parseCouponPatch({ endsAt: null, active: false })).toEqual({
      ok: true,
      value: { endsAt: null, active: false },
    });
  });
});
