import { describe, expect, it } from "vitest";

import { DomainValidationError } from "@/domain/shared/domain-error";
import { Money, roundHalfUpDiv } from "@/domain/shared/money";

const usd = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });

describe("Money (AC-1 foundation, ADR 020)", () => {
  it.each([0, 1, 26000, 2147483648, Number.MAX_SAFE_INTEGER])(
    "accepts %i integer cents without imposing a rate column's limit",
    (amountMinor) => {
      expect(usd(amountMinor)).toMatchObject({ amountMinor, currency: "USD" });
    },
  );

  it.each([
    null,
    {},
    { amountMinor: -1, currency: "USD" },
    { amountMinor: 0.1, currency: "USD" },
    { amountMinor: NaN, currency: "USD" },
    { amountMinor: Infinity, currency: "USD" },
    { amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "USD" },
    { amountMinor: "100", currency: "USD" },
    { amountMinor: 100, currency: "EUR" },
    { amountMinor: 100, currency: "usd" },
    { amountMinor: 100 },
    { amountMinor: 100, currency: "USD", tax: 15 },
  ])("rejects invalid money %j", (input) => {
    expect(() => Money.create(input)).toThrow(DomainValidationError);
  });

  it("adds exact cents without changing either operand", () => {
    const left = usd(1999);
    const right = usd(1);
    const total = left.add(right);
    expect(total.amountMinor).toBe(2000);
    expect(total.currency).toBe("USD");
    expect(left.amountMinor).toBe(1999);
    expect(right.amountMinor).toBe(1);
  });

  it("rejects a mixed currency operand even at an untyped call boundary", () => {
    const left = usd(100);
    expect(() =>
      Reflect.apply(left.add, left, [{ amountMinor: 100, currency: "EUR" }]),
    ).toThrow(DomainValidationError);
  });

  it("rejects addition above the largest safe integer", () => {
    expect(usd(Number.MAX_SAFE_INTEGER).add(usd(0)).amountMinor).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => usd(Number.MAX_SAFE_INTEGER).add(usd(1))).toThrow(
      DomainValidationError,
    );
  });

  it.each([
    [101, 3, 303],
    [100, 0, 0],
    [0, Number.MAX_SAFE_INTEGER, 0],
    [Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER],
  ])("multiplies %i cents by %i exactly", (amount, quantity, expected) => {
    const original = usd(amount);
    expect(original.multiply(quantity).amountMinor).toBe(expected);
    expect(original.amountMinor).toBe(amount);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid multiplier %s",
    (quantity) => {
      expect(() => usd(100).multiply(quantity)).toThrow(DomainValidationError);
    },
  );

  it("rejects multiplication above the largest safe integer", () => {
    expect(() => usd(Number.MAX_SAFE_INTEGER).multiply(2)).toThrow(
      DomainValidationError,
    );
  });

  it("does not retain a mutable input object", () => {
    const input = { amountMinor: 100, currency: "USD" };
    const amount = Money.create(input);
    input.amountMinor = 999;
    expect(amount.amountMinor).toBe(100);
  });
});

describe("roundHalfUpDiv (ADR 027, T-QUOTE-3)", () => {
  it.each([
    [0, 10000, 0],
    [10000, 10000, 1],
    [15015000, 10000, 1502], // 10010 x 1500 = 1501.5 cents
    [33333000, 10000, 3333], // 33333 x 1000 = 3333.3 cents
    [8351250, 10000, 835],
    [55675 * 1500, 10000, 8351], // 8351.25
    [1, 2, 1],
    [1, 3, 0],
    [2, 3, 1],
    [5, 10, 1],
    [4, 10, 0],
  ])("rounds %i / %i to %i", (n, d, expected) => {
    expect(roundHalfUpDiv(n, d)).toBe(expected);
  });

  it("stays exact beyond 2^53 intermediate products", () => {
    expect(roundHalfUpDiv(Number.MAX_SAFE_INTEGER, 1)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(roundHalfUpDiv(Number.MAX_SAFE_INTEGER, 2)).toBe(4503599627370496);
  });

  it.each([
    [-1, 10],
    [1, 0],
    [1, -5],
    [0.5, 2],
    [1, 0.5],
    [NaN, 1],
    [Infinity, 1],
    [Number.MAX_SAFE_INTEGER + 1, 1],
  ])("rejects %s / %s", (n, d) => {
    expect(() => roundHalfUpDiv(n, d)).toThrow(DomainValidationError);
  });
});
