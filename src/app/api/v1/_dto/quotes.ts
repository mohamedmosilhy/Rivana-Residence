import type { z } from "zod";

import type { QuoteResult, QuoteView } from "@/application/quotes";
import type { QuoteResponse } from "@/contracts/api/v1/quotes";

type Response = z.infer<typeof QuoteResponse>;

const usd = (amountMinor: number) => ({
  amountMinor,
  currency: "USD" as const,
});

function quote(view: QuoteView): NonNullable<Response["quote"]> {
  return {
    stay: {
      checkIn: view.stay.checkIn.value,
      checkOut: view.stay.checkOut.value,
    },
    lines: view.lines.map((line) => ({
      roomSlug: line.roomSlug,
      roomName: line.roomName,
      accommodationType: line.accommodationType,
      occupancy: line.occupancy,
      nights: line.nights.map((night) => {
        if (!night.amount) throw new Error("A quoted night has no price.");
        return {
          night: night.night.value,
          amount: usd(night.amount.amountMinor),
          label: night.label,
        };
      }),
      accommodation: usd(line.accommodationMinor),
    })),
    services: view.serviceLines.map((line) => ({
      kind: line.kind as "BREAKFAST" | "AIRPORT_TRANSFER",
      unit: line.unit,
      price: usd(line.priceMinor),
      childPrice:
        line.childPriceMinor === null ? null : usd(line.childPriceMinor),
      adults: line.adults,
      children: line.children,
      nights: line.nights,
      adultQuantity: line.adultQuantity,
      childQuantity: line.childQuantity,
      amount: usd(line.amountMinor),
    })),
    coupon: view.appliedCoupon && {
      code: view.appliedCoupon.code,
      kind: view.appliedCoupon.kind,
      percentBasisPoints: view.appliedCoupon.percentBasisPoints,
      amount:
        view.appliedCoupon.amountMinor === null
          ? null
          : usd(view.appliedCoupon.amountMinor),
    },
    accommodation: usd(view.accommodationMinor),
    servicesTotal: usd(view.servicesMinor),
    subtotal: usd(view.subtotalMinor),
    discount: usd(view.discountMinor),
    taxable: usd(view.taxableMinor),
    vatRateBasisPoints: view.vatRateBasisPoints,
    vat: usd(view.vatMinor),
    total: usd(view.totalMinor),
  };
}

/** An allowlist: internal ids, period ids, and rate sources never leave. */
export function quoteResponse(result: QuoteResult): Response {
  return {
    available: result.available,
    unavailableLines: [...result.unavailableLines],
    bookable: result.bookable,
    quote: result.quote ? quote(result.quote) : null,
  };
}
