import type { QuoteLineView, QuoteView } from "./quote-booking";

type DisplayQuote = Omit<QuoteView, "lines"> & {
  lines: readonly (Omit<QuoteLineView, "roomTypeId" | "nights"> & {
    nights: readonly Pick<
      QuoteLineView["nights"][number],
      "night" | "amount" | "label"
    >[];
  })[];
};

/** Public prices and descriptions. Internal ids, rate sources and contact details stay in the reservation. */
const usd = (amountMinor: number) => ({
  amountMinor,
  currency: "USD" as const,
});

export function displayQuote(view: DisplayQuote) {
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
      vehicles: line.vehicles,
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
