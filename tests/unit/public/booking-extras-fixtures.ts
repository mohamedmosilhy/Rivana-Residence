import type { requestQuote } from "@/presentation/api-client/quotes";
import type {
  OfferedService,
  Quote,
} from "@/presentation/features/booking/extras-state";

export const usd = (amountMinor: number) => ({
  amountMinor,
  currency: "USD" as const,
});

export const bookingServices: OfferedService[] = [
  {
    kind: "BREAKFAST",
    unit: "PER_PERSON_PER_NIGHT",
    price: usd(1000),
    childPrice: usd(500),
  },
  {
    kind: "AIRPORT_TRANSFER",
    unit: "PER_VEHICLE",
    price: usd(3000),
    childPrice: null,
  },
];

/** A branch with both stay windows set (Q-102). */
export const stayTimes = {
  checkInTime: "14:00",
  checkInUntilTime: "23:30",
  checkOutTime: "11:30",
  checkOutFromTime: "00:00",
};

/** A server quote for one room, two nights, with nothing added. */
export function bookingQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    stay: { checkIn: "2026-12-03", checkOut: "2026-12-05" },
    lines: [
      {
        roomSlug: "deluxe",
        roomName: "Deluxe Double",
        accommodationType: "ROOM",
        occupancy: { adults: 2, children: 0 },
        nights: [
          { night: "2026-12-03", amount: usd(8000), label: null },
          { night: "2026-12-04", amount: usd(8000), label: null },
        ],
        accommodation: usd(16_000),
      },
    ],
    services: [],
    coupon: null,
    accommodation: usd(16_000),
    servicesTotal: usd(0),
    subtotal: usd(16_000),
    discount: usd(0),
    taxable: usd(16_000),
    vatRateBasisPoints: 1500,
    vat: usd(2400),
    total: usd(18_400),
    ...overrides,
  };
}

type QuoteCall = Parameters<typeof requestQuote>[0];
type QuoteAnswer = Awaited<ReturnType<typeof requestQuote>>;

/**
 * A stand-in for API-P6. Its figures are fixed by what was asked, so a test can
 * tell which answer the page is showing; they are not a pricing model.
 */
export function answerQuote(
  input: QuoteCall,
  overrides: Partial<Quote> = {},
  paymentMethods: ("PAY_AT_HOTEL" | "ONLINE")[] = ["PAY_AT_HOTEL"],
): QuoteAnswer {
  const code = input.couponCode?.toUpperCase();
  const services = input.services.map((service) => {
    const kind = typeof service === "string" ? service : service.kind;
    const vehicles =
      typeof service === "string" ? null : Number(service.vehicles ?? 1);
    return {
      kind,
      unit: kind === "BREAKFAST" ? "PER_PERSON_PER_NIGHT" : "PER_VEHICLE",
      vehicles,
      price: usd(kind === "BREAKFAST" ? 1000 : 3000),
      childPrice: null,
      adults: 2,
      children: 0,
      nights: 2,
      adultQuantity: 1,
      childQuantity: 0,
      amount: usd(kind === "BREAKFAST" ? 4000 : 3000 * (vehicles ?? 1)),
    } satisfies Quote["services"][number];
  });
  return {
    ok: true,
    status: 200,
    data: {
      available: true,
      unavailableLines: [],
      bookable: true,
      paymentMethods,
      quote: bookingQuote({
        services,
        coupon: code
          ? {
              code,
              kind: "PERCENT",
              percentBasisPoints: 1000,
              amount: null,
            }
          : null,
        discount: usd(code ? 1600 : 0),
        total: usd(18_400 + services.length * 100 - (code ? 1 : 0)),
        ...overrides,
      }),
    },
  };
}
