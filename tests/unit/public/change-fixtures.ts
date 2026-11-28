import type { BookingDetail } from "@/presentation/features/booking/booking-details";
import type { Quote } from "@/presentation/features/booking/extras-state";
import type { ChangeOptions } from "@/presentation/features/booking/hotel-contacts";

import { bookingQuote, bookingServices, usd } from "./booking-extras-fixtures";
import { reservation } from "./guest-reservation-fixtures";

export const options: ChangeOptions = {
  today: "2026-11-28",
  services: bookingServices,
  maxVehicles: 3,
};

export const listing = (
  slug: string,
  name: string,
  maxAdults = 2,
  maxChildren = 1,
) => ({
  slug,
  name,
  accommodationType: "ROOM" as const,
  shortDescription: "",
  maxAdults,
  maxChildren,
  bedroomCount: null,
  bathroomCount: null,
  heroImage: null,
  detailUrl: `/new-cairo/stay/${slug}`,
});

export const listings = [
  listing("deluxe", "Deluxe Double"),
  listing("family", "Family Apartment", 4, 2),
];

/** The server's unchanged preview of the booking below. */
export const currentQuote = (overrides: Partial<Quote> = {}) =>
  bookingQuote(overrides);

export const transferLine = (vehicles: number) => ({
  kind: "AIRPORT_TRANSFER" as const,
  vehicles,
  unit: "PER_VEHICLE" as const,
  price: usd(2500),
  childPrice: null,
  adults: 2,
  children: 0,
  nights: 2,
  adultQuantity: vehicles,
  childQuantity: 0,
  amount: usd(2500 * vehicles),
});

export const booking = (patch: Partial<BookingDetail> = {}) =>
  reservation({
    stay: { checkIn: "2026-12-03", checkOut: "2026-12-05" },
    ...patch,
  });

export const preview = (
  patch: Partial<{
    available: boolean;
    unavailableLines: number[];
    current: Quote;
    proposed: Quote | null;
    outcome: "APPLIES_NOW" | "NEEDS_APPROVAL";
  }> = {},
  etag: string | null = '"v1"',
) => ({
  ok: true as const,
  status: 200 as const,
  ...(etag === null ? {} : { etag }),
  data: {
    available: true,
    unavailableLines: [],
    current: currentQuote(),
    proposed: currentQuote({ total: usd(27_600) }),
    outcome: "APPLIES_NOW" as const,
    deadline: "2026-12-02T12:00:00.000Z",
    ...patch,
  },
});
