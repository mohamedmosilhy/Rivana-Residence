import type { PublicAvailability } from "@/application/public/search-public-availability";
import type { AvailabilityResponseDto } from "@/contracts/api/v1/availability";

import { roomTypeSummary } from "./branches";

/** Explicit allowlist: no internal ids, notes or inventory counts escape. */
export function availabilityResponse(
  value: PublicAvailability,
): AvailabilityResponseDto {
  return {
    stay: {
      checkIn: value.stay.checkIn.value,
      checkOut: value.stay.checkOut.value,
    },
    occupancy: {
      adults: value.occupancy.adults,
      children: value.occupancy.children,
    },
    results: value.results.map((result) => ({
      roomType: roomTypeSummary(value.branchSlug, result.roomType),
      available: result.available,
      unitsAvailable: result.unitsAvailable,
      pricePerNight: result.pricePerNight.map((amount) => ({
        amountMinor: amount.amountMinor,
        currency: amount.currency,
      })),
      accommodationTotal: result.accommodationTotal
        ? {
            amountMinor: result.accommodationTotal.amountMinor,
            currency: result.accommodationTotal.currency,
          }
        : null,
      ...(result.reason === undefined ? {} : { reason: result.reason }),
    })),
  };
}
