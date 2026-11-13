import { describe, expect, it } from "vitest";

import {
  NightlyPriceResolver,
  QuoteCalculator,
  type QuoteCouponValue,
  type QuoteInput,
  type QuoteServiceInput,
} from "@/domain/pricing";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { StayRange } from "@/domain/shared/stay-range";

const usd = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });
const stay = (from: string, to: string) =>
  StayRange.create(LocalDate.parse(from), LocalDate.parse(to));
const nightsAt = (amount: number, nights = 3) => {
  const start = LocalDate.parse("2026-12-01");
  const result = NightlyPriceResolver.resolve({
    stay: StayRange.create(start, start.addDays(nights)),
    baseRate: usd(amount),
    periods: [],
  });
  if (!result.priced) throw new Error("expected priced nights");
  return result.nights;
};
const perBooking = (kind: string, price: number): QuoteServiceInput => ({
  kind,
  unit: "PER_BOOKING",
  price: usd(price),
  childPrice: null,
});
const base = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  lines: [{ nights: nightsAt(8000) }],
  guests: { adults: 2, children: 0 },
  services: [],
  vatRateBasisPoints: 1500,
  ...over,
});

describe("QuoteCalculator (AC-1, AC-2, T-QUOTE-1…10)", () => {
  it("T-QUOTE-1: worked example 1, date periods give 26000 cents", () => {
    const resolved = NightlyPriceResolver.resolve({
      stay: stay("2026-09-14", "2026-09-18"),
      baseRate: null,
      periods: [
        {
          id: "a",
          range: stay("2026-09-01", "2026-09-16"),
          amount: usd(6000),
          active: true,
          label: null,
        },
        {
          id: "b",
          range: stay("2026-09-16", "2026-10-01"),
          amount: usd(7000),
          active: true,
          label: null,
        },
      ],
    });
    if (!resolved.priced) throw new Error("expected priced");
    const quote = QuoteCalculator.compute(
      base({ lines: [{ nights: resolved.nights }], vatRateBasisPoints: 0 }),
    );
    expect(quote.accommodationMinor).toBe(26000);
    expect(quote.totalMinor).toBe(26000);
  });

  it("T-QUOTE-2: worked example 2 composes to 64026", () => {
    const quote = QuoteCalculator.compute({
      lines: [{ nights: nightsAt(8000) }, { nights: nightsAt(12000) }],
      guests: { adults: 4, children: 0 },
      services: [perBooking("BREAKFAST", 3000), perBooking("TRANSFER", 2500)],
      coupon: { kind: "PERCENT", percentBasisPoints: 1500 },
      vatRateBasisPoints: 1500,
    });
    expect(quote).toMatchObject({
      accommodationMinor: 60000,
      servicesMinor: 5500,
      subtotalMinor: 65500,
      discountMinor: 9825,
      taxableMinor: 55675,
      vatRateBasisPoints: 1500,
      vatMinor: 8351,
      totalMinor: 64026,
    });
    expect(quote.lines.map((line) => line.accommodationMinor)).toEqual([
      24000, 36000,
    ]);
  });

  it("T-QUOTE-3: half up at exactly .5 cent (example 3)", () => {
    const vat = QuoteCalculator.compute(
      base({ lines: [{ nights: nightsAt(10010, 1) }] }),
    );
    expect(vat.vatMinor).toBe(1502);
    expect(vat.totalMinor).toBe(11512);
    const coupon = QuoteCalculator.compute(
      base({
        lines: [{ nights: nightsAt(33333, 1) }],
        coupon: { kind: "PERCENT", percentBasisPoints: 1000 },
        vatRateBasisPoints: 0,
      }),
    );
    expect(coupon.discountMinor).toBe(3333);
  });

  it("T-QUOTE-3b: odd .5 ties round up, which half even and Math.round would not all do", () => {
    // 10030 x 15% = 1504.5 -> 1505 (half even would give 1504).
    const vat = QuoteCalculator.compute(
      base({ lines: [{ nights: nightsAt(10030, 1) }] }),
    );
    expect(vat.vatMinor).toBe(1505);
    // 10005 x 10% = 1000.5 -> 1001 (half even would give 1000).
    const coupon = QuoteCalculator.compute(
      base({
        lines: [{ nights: nightsAt(10005, 1) }],
        coupon: { kind: "PERCENT", percentBasisPoints: 1000 },
        vatRateBasisPoints: 0,
      }),
    );
    expect(coupon.discountMinor).toBe(1001);
  });

  it("T-QUOTE-4: percent coupon rounds once on the subtotal, not per night", () => {
    // 3 nights x 3333 = 9999; 10% = 999.9 -> 1000. Per night would give 333 x 3 = 999.
    const quote = QuoteCalculator.compute(
      base({
        lines: [{ nights: nightsAt(3333) }],
        coupon: { kind: "PERCENT", percentBasisPoints: 1000 },
        vatRateBasisPoints: 0,
      }),
    );
    expect(quote.discountMinor).toBe(1000);
  });

  it("T-QUOTE-5: a fixed coupon above the subtotal gives total 0 (example 4)", () => {
    const quote = QuoteCalculator.compute(
      base({
        lines: [{ nights: nightsAt(4000, 1) }],
        coupon: { kind: "FIXED", amount: usd(5000) },
      }),
    );
    expect(quote).toMatchObject({
      subtotalMinor: 4000,
      discountMinor: 4000,
      taxableMinor: 0,
      vatMinor: 0,
      totalMinor: 0,
    });
  });

  it("T-QUOTE-5b: a fixed coupon below the subtotal subtracts exactly", () => {
    const quote = QuoteCalculator.compute(
      base({ coupon: { kind: "FIXED", amount: usd(1000) } }),
    );
    expect(quote.discountMinor).toBe(1000);
    expect(quote.taxableMinor).toBe(23000);
  });

  it("T-QUOTE-6: no services and no coupon", () => {
    const quote = QuoteCalculator.compute(base({ vatRateBasisPoints: 0 }));
    expect(quote).toMatchObject({
      servicesMinor: 0,
      discountMinor: 0,
      subtotalMinor: 24000,
      totalMinor: 24000,
    });
    expect(quote.serviceLines).toEqual([]);
  });

  it("T-QUOTE-7: a 100% percent coupon removes the whole subtotal", () => {
    const quote = QuoteCalculator.compute(
      base({ coupon: { kind: "PERCENT", percentBasisPoints: 10000 } }),
    );
    expect(quote).toMatchObject({
      discountMinor: 24000,
      taxableMinor: 0,
      vatMinor: 0,
      totalMinor: 0,
    });
  });

  it("T-QUOTE-8: VAT 0% adds nothing and 100% doubles the taxable amount", () => {
    expect(
      QuoteCalculator.compute(base({ vatRateBasisPoints: 0 })),
    ).toMatchObject({ vatMinor: 0, totalMinor: 24000 });
    expect(
      QuoteCalculator.compute(base({ vatRateBasisPoints: 10000 })),
    ).toMatchObject({ vatMinor: 24000, totalMinor: 48000 });
  });

  it("T-QUOTE-9: worked example 5, service units and a child price", () => {
    const quote = QuoteCalculator.compute({
      lines: [{ nights: nightsAt(8000) }],
      guests: { adults: 2, children: 1 },
      services: [
        {
          kind: "BREAKFAST",
          unit: "PER_PERSON_PER_NIGHT",
          price: usd(1000),
          childPrice: usd(500),
        },
        perBooking("AIRPORT_TRANSFER", 2500),
      ],
      vatRateBasisPoints: 1500,
    });
    expect(quote.serviceLines).toEqual([
      {
        kind: "BREAKFAST",
        unit: "PER_PERSON_PER_NIGHT",
        priceMinor: 1000,
        childPriceMinor: 500,
        adults: 2,
        children: 1,
        nights: 3,
        adultQuantity: 6,
        childQuantity: 3,
        amountMinor: 7500,
      },
      {
        kind: "AIRPORT_TRANSFER",
        unit: "PER_BOOKING",
        priceMinor: 2500,
        childPriceMinor: null,
        adults: 2,
        children: 1,
        nights: 3,
        adultQuantity: 1,
        childQuantity: 0,
        amountMinor: 2500,
      },
    ]);
    expect(quote).toMatchObject({
      servicesMinor: 10000,
      subtotalMinor: 34000,
      vatMinor: 5100,
      totalMinor: 39100,
    });
  });

  it("T-QUOTE-9b: children are not charged without a child price", () => {
    const quote = QuoteCalculator.compute(
      base({
        guests: { adults: 2, children: 3 },
        services: [
          {
            kind: "BREAKFAST",
            unit: "PER_PERSON",
            price: usd(1000),
            childPrice: null,
          },
        ],
        vatRateBasisPoints: 0,
      }),
    );
    expect(quote.serviceLines[0]).toMatchObject({
      adults: 2,
      children: 3,
      adultQuantity: 2,
      childQuantity: 0,
      childPriceMinor: null,
      amountMinor: 2000,
    });
  });

  it("T-QUOTE-9c: a per night service multiplies only by nights", () => {
    const quote = QuoteCalculator.compute(
      base({
        services: [
          {
            kind: "BREAKFAST",
            unit: "PER_NIGHT",
            price: usd(700),
            childPrice: null,
          },
        ],
        vatRateBasisPoints: 0,
      }),
    );
    expect(quote.servicesMinor).toBe(2100);
  });

  it("T-QUOTE-9d: service totals feed the coupon and VAT base", () => {
    const quote = QuoteCalculator.compute(
      base({
        services: [perBooking("BREAKFAST", 1000)],
        coupon: { kind: "FIXED", amount: usd(1000) },
        vatRateBasisPoints: 1000,
      }),
    );
    expect(quote).toMatchObject({
      subtotalMinor: 25000,
      taxableMinor: 24000,
      vatMinor: 2400,
      totalMinor: 26400,
    });
  });

  it("T-QUOTE-10: results are integers, frozen, and inputs are not mutated", () => {
    const input = base({
      services: [perBooking("BREAKFAST", 1999)],
      coupon: { kind: "PERCENT", percentBasisPoints: 333 },
      vatRateBasisPoints: 1499,
    });
    const before = JSON.stringify(input);
    const quote = QuoteCalculator.compute(input);
    for (const value of [
      quote.accommodationMinor,
      quote.servicesMinor,
      quote.subtotalMinor,
      quote.discountMinor,
      quote.taxableMinor,
      quote.vatMinor,
      quote.totalMinor,
    ])
      expect(Number.isSafeInteger(value)).toBe(true);
    expect(Object.isFrozen(quote)).toBe(true);
    expect(Object.isFrozen(quote.lines)).toBe(true);
    expect(Object.isFrozen(quote.lines[0])).toBe(true);
    expect(Object.isFrozen(quote.serviceLines)).toBe(true);
    expect(Object.isFrozen(quote.serviceLines[0])).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(quote.totalMinor).toBe(quote.taxableMinor + quote.vatMinor);
  });

  describe("guards", () => {
    const unpriced = [
      {
        night: LocalDate.parse("2026-12-01"),
        amount: null,
        source: null,
        periodId: null,
        label: null,
      },
    ];
    const cases: [string, () => QuoteInput, string][] = [
      ["no lines", () => base({ lines: [] }), "lines"],
      [
        "an unpriced night",
        () => base({ lines: [{ nights: unpriced }] }),
        "lines.0",
      ],
      [
        "lines of different length",
        () =>
          base({
            lines: [
              { nights: nightsAt(8000, 3) },
              { nights: nightsAt(8000, 2) },
            ],
          }),
        "lines.1",
      ],
      [
        "a duplicate service",
        () =>
          base({
            services: [perBooking("BREAKFAST", 1), perBooking("BREAKFAST", 2)],
          }),
        "services.1",
      ],
      [
        "a child price on a per booking unit",
        () =>
          base({
            services: [
              { ...perBooking("BREAKFAST", 100), childPrice: usd(50) },
            ],
          }),
        "services.0.childPrice",
      ],
      [
        "an unknown service unit",
        () =>
          base({
            services: [
              {
                ...perBooking("BREAKFAST", 100),
                unit: "PER_ROOM" as unknown as "PER_BOOKING",
              },
            ],
          }),
        "services.0.unit",
      ],
      [
        "VAT below 0",
        () => base({ vatRateBasisPoints: -1 }),
        "vatRateBasisPoints",
      ],
      [
        "VAT above 100%",
        () => base({ vatRateBasisPoints: 10001 }),
        "vatRateBasisPoints",
      ],
      [
        "fractional VAT",
        () => base({ vatRateBasisPoints: 15.5 }),
        "vatRateBasisPoints",
      ],
      [
        "NaN VAT",
        () => base({ vatRateBasisPoints: NaN }),
        "vatRateBasisPoints",
      ],
      [
        "a null VAT rate",
        () => base({ vatRateBasisPoints: null as unknown as number }),
        "vatRateBasisPoints",
      ],
      [
        "percent coupon of 0",
        () => base({ coupon: { kind: "PERCENT", percentBasisPoints: 0 } }),
        "coupon.percentBasisPoints",
      ],
      [
        "percent coupon above 100%",
        () => base({ coupon: { kind: "PERCENT", percentBasisPoints: 10001 } }),
        "coupon.percentBasisPoints",
      ],
      [
        "a zero fixed coupon",
        () => base({ coupon: { kind: "FIXED", amount: usd(0) } }),
        "coupon.amount",
      ],
      [
        "an unsupported coupon kind",
        () =>
          base({
            coupon: { kind: "BOGO" } as unknown as QuoteCouponValue,
          }),
        "coupon.kind",
      ],
      [
        "no adults",
        () => base({ guests: { adults: 0, children: 0 } }),
        "guests.adults",
      ],
      [
        "negative children",
        () => base({ guests: { adults: 1, children: -1 } }),
        "guests.children",
      ],
      [
        "fractional children",
        () => base({ guests: { adults: 1, children: 0.5 } }),
        "guests.children",
      ],
      [
        "an amount beyond the safe integer range",
        () =>
          base({
            lines: [
              { nights: nightsAt(Number.MAX_SAFE_INTEGER, 1) },
              { nights: nightsAt(Number.MAX_SAFE_INTEGER, 1) },
            ],
          }),
        "accommodationMinor",
      ],
    ];
    it.each(cases)("rejects %s", (_name, build, path) => {
      let error: unknown;
      try {
        QuoteCalculator.compute(build());
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(DomainValidationError);
      expect(
        (error as DomainValidationError).issues.map((issue) => issue.path),
      ).toContain(path);
    });
  });
});
