import { describe, expect, it } from "vitest";

import { normalizeCouponCode } from "@/domain/coupons";

describe("normalizeCouponCode (CP-1, Q-57 case insensitive)", () => {
  it.each([
    ["WELCOME15", "WELCOME15"],
    ["welcome15", "WELCOME15"],
    ["  WeLcOmE15 \n", "WELCOME15"],
    ["spring-2027", "SPRING-2027"],
    ["vip_guest", "VIP_GUEST"],
    ["abc", "ABC"],
    ["A".repeat(32), "A".repeat(32)],
    ["9lives", "9LIVES"],
  ])("normalizes %j to %s", (raw, code) => {
    expect(normalizeCouponCode(raw)).toEqual({ ok: true, code });
  });

  it.each([
    "ab",
    "A".repeat(33),
    "",
    "   ",
    "has space",
    "-LEADING",
    "_LEADING",
    "dot.code",
    "slash/code",
    "emoji🎉code",
    "İSTANBUL",
    "straße",
    "ＡＢＣ",
    "code\u0000",
  ])("refuses %j", (raw) => {
    const result = normalizeCouponCode(raw);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.path)).toEqual(["couponCode"]);
  });

  it.each([null, undefined, 42, {}, ["ABC"], true])(
    "refuses a non string %j",
    (raw) => {
      expect(normalizeCouponCode(raw).ok).toBe(false);
    },
  );

  it("is idempotent", () => {
    const first = normalizeCouponCode(" welcome15 ");
    if (!first.ok) throw new Error("expected ok");
    expect(normalizeCouponCode(first.code)).toEqual(first);
  });
});
