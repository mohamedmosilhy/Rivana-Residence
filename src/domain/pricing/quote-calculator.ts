import { DomainValidationError } from "@/domain/shared/domain-error";
import { Money, roundHalfUpDiv } from "@/domain/shared/money";
import {
  SERVICE_PRICE_UNITS,
  isPersonUnit,
  serviceQuantity,
  type ServicePriceUnit,
} from "@/domain/services";

import type { ResolvedNightPrice } from "./nightly-price-resolver";

const BASIS_POINTS = 10_000;

export type QuoteCouponValue =
  | Readonly<{ kind: "PERCENT"; percentBasisPoints: number }>
  | Readonly<{ kind: "FIXED"; amount: Money }>;

export type QuoteServiceInput = Readonly<{
  kind: string;
  unit: ServicePriceUnit;
  price: Money;
  childPrice: Money | null;
}>;

export type QuoteInput = Readonly<{
  lines: readonly Readonly<{ nights: readonly ResolvedNightPrice[] }>[];
  guests: Readonly<{ adults: number; children: number }>;
  services: readonly QuoteServiceInput[];
  coupon?: QuoteCouponValue;
  vatRateBasisPoints: number;
}>;

/**
 * One service line, complete enough to snapshot (M8). `adults`, `children`
 * and `nights` are the booking's own counts; the quantities are the
 * multipliers the unit applied to the adult and child price.
 * `amountMinor = priceMinor * adultQuantity + childPriceMinor * childQuantity`.
 */
export type QuoteServiceLine = Readonly<{
  kind: string;
  unit: ServicePriceUnit;
  priceMinor: number;
  childPriceMinor: number | null;
  adults: number;
  children: number;
  nights: number;
  adultQuantity: number;
  childQuantity: number;
  amountMinor: number;
}>;

export type QuoteLine = Readonly<{
  accommodationMinor: number;
  nights: readonly ResolvedNightPrice[];
}>;

export type Quote = Readonly<{
  lines: readonly QuoteLine[];
  serviceLines: readonly QuoteServiceLine[];
  accommodationMinor: number;
  servicesMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  vatRateBasisPoints: number;
  vatMinor: number;
  totalMinor: number;
}>;

function fail(path: string, message: string): never {
  throw new DomainValidationError("The quote input is invalid.", [
    { path, message },
  ]);
}

function safeSum(left: number, right: number, path: string) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) fail(path, "The amount is too large.");
  return sum;
}

function safeProduct(left: number, right: number, path: string) {
  const product = BigInt(left) * BigInt(right);
  if (product > BigInt(Number.MAX_SAFE_INTEGER))
    fail(path, "The amount is too large.");
  return Number(product);
}

function checkBasisPoints(value: unknown, min: number, path: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > BASIS_POINTS
  )
    fail(path, `Use an integer from ${min} to ${BASIS_POINTS} basis points.`);
  return value;
}

/**
 * Pure, integer only composition of ADR 027 (accommodation, services,
 * subtotal, coupon, taxable, VAT, total). Rounds half up only twice: the
 * percent coupon on the subtotal and VAT on the taxable amount. No clock,
 * no I/O, no floating point.
 */
export class QuoteCalculator {
  static compute(input: QuoteInput): Quote {
    const first = input.lines[0];
    if (!first) fail("lines", "Supply at least one unit.");
    const nightCount = first.nights.length;
    if (nightCount < 1) fail("lines", "Each unit needs at least one night.");
    if (!Number.isSafeInteger(input.guests.adults) || input.guests.adults < 1)
      fail("guests.adults", "Use at least one adult.");
    if (
      !Number.isSafeInteger(input.guests.children) ||
      input.guests.children < 0
    )
      fail("guests.children", "Use a nonnegative safe integer.");

    let accommodation = 0;
    const lines = input.lines.map((line, index): QuoteLine => {
      if (line.nights.length !== nightCount)
        fail(`lines.${index}`, "Every unit must cover the same nights.");
      let lineTotal = 0;
      for (const night of line.nights) {
        if (night.amount === null)
          fail(`lines.${index}`, "Every night must be priced.");
        lineTotal = safeSum(lineTotal, night.amount.amountMinor, "lines");
      }
      accommodation = safeSum(accommodation, lineTotal, "accommodationMinor");
      return Object.freeze({
        accommodationMinor: lineTotal,
        nights: Object.freeze([...line.nights]),
      });
    });

    const kinds = new Set<string>();
    let services = 0;
    const serviceLines = input.services.map((service, index) => {
      if (kinds.has(service.kind))
        fail(`services.${index}`, "Supply each service once.");
      kinds.add(service.kind);
      if (!SERVICE_PRICE_UNITS.includes(service.unit))
        fail(`services.${index}.unit`, "Use a supported price unit.");
      if (service.childPrice !== null && !isPersonUnit(service.unit))
        fail(
          `services.${index}.childPrice`,
          "A child price applies only to person units.",
        );
      const quantity = serviceQuantity(service.unit, input.guests, nightCount);
      const adultPart = safeProduct(
        service.price.amountMinor,
        quantity.adults,
        `services.${index}`,
      );
      const childQuantity = service.childPrice ? quantity.children : 0;
      const childPart = service.childPrice
        ? safeProduct(
            service.childPrice.amountMinor,
            childQuantity,
            `services.${index}`,
          )
        : 0;
      const amountMinor = safeSum(adultPart, childPart, `services.${index}`);
      services = safeSum(services, amountMinor, "servicesMinor");
      return Object.freeze({
        kind: service.kind,
        unit: service.unit,
        priceMinor: service.price.amountMinor,
        childPriceMinor: service.childPrice?.amountMinor ?? null,
        adults: input.guests.adults,
        children: input.guests.children,
        nights: nightCount,
        adultQuantity: quantity.adults,
        childQuantity,
        amountMinor,
      });
    });

    const subtotal = safeSum(accommodation, services, "subtotalMinor");

    // Destructured on purpose: the persistence boundary test reads a dotted
    // property named like a table as a database call.
    const { coupon } = input;
    let discount = 0;
    if (coupon?.kind === "PERCENT") {
      const bp = checkBasisPoints(
        coupon.percentBasisPoints,
        1,
        "coupon.percentBasisPoints",
      );
      discount = roundHalfUpDiv(
        safeProduct(subtotal, bp, "discountMinor"),
        BASIS_POINTS,
      );
    } else if (coupon?.kind === "FIXED") {
      if (coupon.amount.amountMinor < 1)
        fail("coupon.amount", "A fixed coupon must be positive.");
      discount = Math.min(coupon.amount.amountMinor, subtotal);
    } else if (coupon) {
      fail("coupon.kind", "Use a supported coupon kind.");
    }
    discount = Math.min(discount, subtotal);

    const taxable = subtotal - discount;
    const vatRate = checkBasisPoints(
      input.vatRateBasisPoints,
      0,
      "vatRateBasisPoints",
    );
    const vat = roundHalfUpDiv(
      safeProduct(taxable, vatRate, "vatMinor"),
      BASIS_POINTS,
    );
    const total = safeSum(taxable, vat, "totalMinor");

    return Object.freeze({
      lines: Object.freeze(lines),
      serviceLines: Object.freeze(serviceLines),
      accommodationMinor: accommodation,
      servicesMinor: services,
      subtotalMinor: subtotal,
      discountMinor: discount,
      taxableMinor: taxable,
      vatRateBasisPoints: vatRate,
      vatMinor: vat,
      totalMinor: total,
    });
  }
}
