import type { BookingDetail } from "@/presentation/features/booking/booking-details";
import type { GuestHotel } from "@/presentation/features/booking/hotel-contacts";

import { stayTimes } from "./booking-extras-fixtures";

export const hotels: GuestHotel[] = [
  {
    slug: "new-cairo",
    name: "Rivana New Cairo",
    phone: "+12025550124",
    email: "hotel@example.test",
    times: stayTimes,
  },
  {
    slug: "giza",
    name: "Rivana Giza",
    phone: "+12025550125",
    email: "giza@example.test",
    times: stayTimes,
  },
];

/** A confirmed pay at hotel booking that may still ask to cancel. */
export function reservation(patch: Partial<BookingDetail> = {}): BookingDetail {
  return {
    reference: "RR-DEMO0001",
    status: "CONFIRMED",
    paymentMethod: "PAY_AT_HOTEL",
    paymentStatus: "NOT_REQUIRED",
    branch: {
      name: "Rivana New Cairo",
      slug: "new-cairo",
      phone: "+12025550124",
      email: "hotel@example.test",
      timeZone: "Africa/Cairo",
    },
    stay: { checkIn: "2027-03-01", checkOut: "2027-03-03" },
    units: [
      {
        roomName: "Deluxe Double",
        occupancy: { adults: 2, children: 0 },
        subtotal: { amountMinor: 12000, currency: "USD" },
      },
    ],
    contact: {
      fullName: "Amina Hassan",
      email: "amina@example.test",
      phone: "+12025550101",
      country: "US",
      specialRequests: "A quiet room",
    },
    price: {
      currency: "USD",
      accommodationMinor: 12000,
      servicesMinor: 0,
      subtotalMinor: 12000,
      discountMinor: 0,
      taxableMinor: 12000,
      vatRateBasisPoints: 1400,
      vatMinor: 1680,
      totalMinor: 13680,
      services: [],
    },
    cancellationDeadline: "2027-02-28T12:00:00.000Z",
    cancellationRequest: null,
    changeRequest: null,
    allowedActions: ["REQUEST_CANCELLATION", "CHANGE_RESERVATION"],
    createdAt: "2026-11-01T10:00:00.000Z",
    ...patch,
  };
}

type CancellationStatus = NonNullable<
  BookingDetail["cancellationRequest"]
>["status"];

export const cancellation = (
  status: CancellationStatus,
  decisionReason: string | null = null,
) => ({
  id: "request-1",
  status,
  createdAt: "2026-11-02T10:00:00.000Z",
  decisionReason,
});

export const ok = <Data>(data: Data, status = 200) => ({
  ok: true as const,
  status,
  data,
});

export const refusal = (
  code: string,
  status: number | null = 400,
  extra: Record<string, unknown> = {},
) => ({
  ok: false as const,
  problem: { code, status, title: "Refused", ...extra },
});
