import { describe, expect, it } from "vitest";

import {
  CouponPolicy,
  type CouponContext,
  type CouponRecord,
} from "@/domain/coupons";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { Money } from "@/domain/shared/money";
import type { QuoteCouponValue } from "@/domain/pricing";

const usd = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });
const at = (iso: string) => new Date(iso);

const coupon = (over: Partial<CouponRecord> = {}): CouponRecord => ({
  code: "WELCOME15",
  kind: "PERCENT",
  percentBasisPoints: 1500,
  amount: null,
  active: true,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  maxRedemptionsPerPhone: null,
  allBranches: true,
  branchIds: [],
  ...over,
});
const context = (over: Partial<CouponContext> = {}): CouponContext => ({
  branchId: "branch-a",
  now: at("2027-03-01T12:00:00.000Z"),
  redemptionsTotal: 0,
  redemptionsForPhone: 0,
  ...over,
});

describe("CouponPolicy.validate (CP-1, CP-7, T-CPN-1…5)", () => {
  it("accepts a percent coupon and returns the quote value", () => {
    expect(CouponPolicy.validate(coupon(), context())).toEqual({
      valid: true,
      value: { kind: "PERCENT", percentBasisPoints: 1500 },
    });
  });

  it("accepts a fixed coupon and returns the quote value", () => {
    const fixed = coupon({
      kind: "FIXED",
      percentBasisPoints: null,
      amount: usd(5000),
    });
    expect(CouponPolicy.validate(fixed, context())).toEqual({
      valid: true,
      value: { kind: "FIXED", amount: usd(5000) },
    });
  });

  it("returns a value the quote calculator accepts", () => {
    const result = CouponPolicy.validate(coupon(), context());
    if (!result.valid) throw new Error("expected valid");
    const accepted: QuoteCouponValue = result.value;
    expect(accepted.kind).toBe("PERCENT");
  });

  it("T-CPN-1: NOT_FOUND for no coupon", () => {
    expect(CouponPolicy.validate(null, context())).toEqual({
      valid: false,
      reason: "NOT_FOUND",
    });
  });

  it("T-CPN-2: INACTIVE", () => {
    expect(CouponPolicy.validate(coupon({ active: false }), context())).toEqual(
      { valid: false, reason: "INACTIVE" },
    );
  });

  it("T-CPN-3: window instants are start inclusive and end exclusive", () => {
    const windowed = coupon({
      startsAt: at("2027-03-01T00:00:00.000Z"),
      endsAt: at("2027-03-31T00:00:00.000Z"),
    });
    const reason = (iso: string) =>
      CouponPolicy.validate(windowed, context({ now: at(iso) }));
    expect(reason("2027-02-28T23:59:59.999Z")).toEqual({
      valid: false,
      reason: "NOT_YET_VALID",
    });
    expect(reason("2027-03-01T00:00:00.000Z").valid).toBe(true);
    expect(reason("2027-03-30T23:59:59.999Z").valid).toBe(true);
    expect(reason("2027-03-31T00:00:00.000Z")).toEqual({
      valid: false,
      reason: "EXPIRED",
    });
  });

  it("T-CPN-4: all branches versus listed branches", () => {
    const listed = coupon({
      allBranches: false,
      branchIds: ["branch-a", "branch-c"],
    });
    expect(CouponPolicy.validate(listed, context()).valid).toBe(true);
    expect(
      CouponPolicy.validate(listed, context({ branchId: "branch-b" })),
    ).toEqual({ valid: false, reason: "WRONG_BRANCH" });
    expect(
      CouponPolicy.validate(coupon(), context({ branchId: "branch-z" })).valid,
    ).toBe(true);
    expect(
      CouponPolicy.validate(
        coupon({ allBranches: false, branchIds: [] }),
        context(),
      ),
    ).toEqual({ valid: false, reason: "WRONG_BRANCH" });
  });

  it("T-CPN-5: total limit counts at the limit, not just beyond it", () => {
    const limited = coupon({ maxRedemptions: 3 });
    expect(
      CouponPolicy.validate(limited, context({ redemptionsTotal: 2 })).valid,
    ).toBe(true);
    expect(
      CouponPolicy.validate(limited, context({ redemptionsTotal: 3 })),
    ).toEqual({ valid: false, reason: "LIMIT_REACHED" });
    expect(
      CouponPolicy.validate(limited, context({ redemptionsTotal: 9 })),
    ).toEqual({ valid: false, reason: "LIMIT_REACHED" });
  });

  it("T-CPN-5b: the per phone limit applies only when a phone is supplied", () => {
    const limited = coupon({ maxRedemptionsPerPhone: 1 });
    expect(
      CouponPolicy.validate(limited, context({ redemptionsForPhone: 1 })).valid,
    ).toBe(true);
    expect(
      CouponPolicy.validate(
        limited,
        context({ phone: "+201000000000", redemptionsForPhone: 0 }),
      ).valid,
    ).toBe(true);
    expect(
      CouponPolicy.validate(
        limited,
        context({ phone: "+201000000000", redemptionsForPhone: 1 }),
      ),
    ).toEqual({ valid: false, reason: "PHONE_LIMIT_REACHED" });
  });

  it("null limits mean no limit", () => {
    expect(
      CouponPolicy.validate(
        coupon(),
        context({
          phone: "+201000000000",
          redemptionsTotal: 1_000_000,
          redemptionsForPhone: 1_000_000,
        }),
      ).valid,
    ).toBe(true);
  });

  it("reports the first failing reason in the fixed order", () => {
    const everythingWrong = coupon({
      active: false,
      startsAt: at("2030-01-01T00:00:00.000Z"),
      allBranches: false,
      branchIds: ["x"],
      maxRedemptions: 1,
      maxRedemptionsPerPhone: 1,
    });
    const ctx = context({
      phone: "+201000000000",
      redemptionsTotal: 5,
      redemptionsForPhone: 5,
    });
    expect(CouponPolicy.validate(everythingWrong, ctx)).toEqual({
      valid: false,
      reason: "INACTIVE",
    });
    const active = { ...everythingWrong, active: true };
    expect(CouponPolicy.validate(active, ctx)).toEqual({
      valid: false,
      reason: "NOT_YET_VALID",
    });
    const started = { ...active, startsAt: null };
    expect(CouponPolicy.validate(started, ctx)).toEqual({
      valid: false,
      reason: "WRONG_BRANCH",
    });
    const expired = { ...started, endsAt: at("2027-01-01T00:00:00.000Z") };
    expect(CouponPolicy.validate(expired, ctx)).toEqual({
      valid: false,
      reason: "EXPIRED",
    });
    const here = { ...started, allBranches: true };
    expect(CouponPolicy.validate(here, ctx)).toEqual({
      valid: false,
      reason: "LIMIT_REACHED",
    });
    const roomy = { ...here, maxRedemptions: null };
    expect(CouponPolicy.validate(roomy, ctx)).toEqual({
      valid: false,
      reason: "PHONE_LIMIT_REACHED",
    });
  });

  it("does not mutate its inputs", () => {
    const record = Object.freeze(coupon({ branchIds: Object.freeze(["a"]) }));
    const ctx = Object.freeze(context());
    expect(() => CouponPolicy.validate(record, ctx)).not.toThrow();
  });

  describe("fails closed on corrupt input", () => {
    it.each<[string, () => CouponRecord | null, Partial<CouponContext>]>([
      ["percent of 0", () => coupon({ percentBasisPoints: 0 }), {}],
      ["percent above 100%", () => coupon({ percentBasisPoints: 10001 }), {}],
      [
        "percent with a null value",
        () => coupon({ percentBasisPoints: null }),
        {},
      ],
      ["percent carrying an amount", () => coupon({ amount: usd(100) }), {}],
      [
        "fixed without an amount",
        () => coupon({ kind: "FIXED", percentBasisPoints: null, amount: null }),
        {},
      ],
      [
        "fixed carrying a percent",
        () => coupon({ kind: "FIXED", amount: usd(100) }),
        {},
      ],
      [
        "fixed with a zero amount",
        () =>
          coupon({ kind: "FIXED", percentBasisPoints: null, amount: usd(0) }),
        {},
      ],
      [
        "an unknown kind",
        () => coupon({ kind: "BOGO" as unknown as "PERCENT" }),
        {},
      ],
      ["an invalid start date", () => coupon({ startsAt: new Date(NaN) }), {}],
      ["an invalid end date", () => coupon({ endsAt: new Date(NaN) }), {}],
      [
        "a non boolean active flag",
        () => coupon({ active: "false" as unknown as boolean }),
        {},
      ],
      [
        "a non boolean allBranches flag",
        () => coupon({ allBranches: "no" as unknown as boolean }),
        {},
      ],
      [
        "branchIds that is a string",
        () =>
          coupon({
            allBranches: false,
            branchIds: "xbx" as unknown as readonly string[],
          }),
        {},
      ],
      [
        "a non string branch id",
        () =>
          coupon({
            allBranches: false,
            branchIds: [1] as unknown as readonly string[],
          }),
        {},
      ],
      ["an empty phone", () => coupon(), { phone: "" }],
      ["a null phone", () => coupon(), { phone: null as unknown as string }],
      ["a zero total limit", () => coupon({ maxRedemptions: 0 }), {}],
      [
        "a fractional phone limit",
        () => coupon({ maxRedemptionsPerPhone: 1.5 }),
        {},
      ],
      ["an invalid now", () => coupon(), { now: new Date(NaN) }],
      ["a negative total count", () => coupon(), { redemptionsTotal: -1 }],
      [
        "a fractional phone count",
        () => coupon(),
        { redemptionsForPhone: 0.5 },
      ],
    ])("throws a typed error for %s", (_name, build, over) => {
      expect(() => CouponPolicy.validate(build(), context(over))).toThrow(
        DomainValidationError,
      );
    });
  });
});
