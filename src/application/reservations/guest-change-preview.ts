import type { CatalogRoomType } from "@/application/inventory";
import { displayQuote, type QuoteView } from "@/application/quotes";
import type { Occupancy } from "@/domain/shared/occupancy";
import type { StayRange } from "@/domain/shared/stay-range";
import type {
  StoredReservation,
  StoredReservationNight,
  StoredReservationSnapshot,
} from "./ports";

export type GuestChangeListing = CatalogRoomType & {
  slug: string;
  accommodationType: QuoteView["lines"][number]["accommodationType"];
};

type PricedUnit = Readonly<{
  roomTypeId: string;
  occupancy: Occupancy;
  nights: readonly StoredReservationNight[];
  accommodationMinor: number;
}>;

export function guestChangePreview(
  reservation: StoredReservation,
  current: StoredReservationSnapshot,
  next: Readonly<{
    stay: StayRange;
    lines: readonly PricedUnit[];
    snapshot: StoredReservationSnapshot;
  }> | null,
  listings: ReadonlyMap<string, GuestChangeListing>,
  deadline: string,
  unavailableLines: readonly number[],
) {
  function quote(
    stay: StayRange,
    lines: readonly PricedUnit[],
    snapshot: StoredReservationSnapshot,
  ) {
    const { couponValue } = snapshot;
    return displayQuote({
      ...snapshot,
      stay,
      lines: lines.map((line) => {
        const listing = listings.get(line.roomTypeId);
        if (!listing) throw new Error("A quoted reservation has no listing.");
        return {
          ...line,
          roomSlug: listing.slug,
          roomName: listing.name,
          accommodationType: listing.accommodationType,
        };
      }),
      appliedCoupon:
        couponValue && reservation.couponCode
          ? {
              code: reservation.couponCode,
              kind: couponValue.kind,
              percentBasisPoints:
                couponValue.kind === "PERCENT"
                  ? couponValue.percentBasisPoints
                  : null,
              amountMinor:
                couponValue.kind === "FIXED"
                  ? couponValue.amount.amountMinor
                  : null,
            }
          : null,
    });
  }

  const storedLines = reservation.lines.map((line) => {
    if (!line.subtotal)
      throw new Error("A priced reservation has a unit without a subtotal.");
    return { ...line, accommodationMinor: line.subtotal.amountMinor };
  });

  return {
    available: next !== null,
    unavailableLines: [...unavailableLines],
    current: quote(reservation.stay, storedLines, current),
    proposed: next ? quote(next.stay, next.lines, next.snapshot) : null,
    outcome: "APPLIES_NOW" as const,
    deadline,
  };
}

export type GuestChangePreview = ReturnType<typeof guestChangePreview>;
