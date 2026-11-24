import type { z } from "zod";
import type { MoneyDto } from "@/contracts/api/v1/primitives";

import type {
  StaffReservationView,
  WebsiteReservationResult,
} from "@/application/reservations";
import type {
  StaffReservationDetail,
  WebsiteReservationCreated,
  WebsiteReservationReplayed,
} from "@/contracts/api/v1/reservations";

type Created = z.infer<typeof WebsiteReservationCreated>;
type Replayed = z.infer<typeof WebsiteReservationReplayed>;

/** The plain manage link, shown once (spec 0005 Decision 4). */
export const manageUrl = (token: string) => `/reservations/manage#t=${token}`;

/** A fresh booking, or the replay of one: never a repeated manage link. */
export function reservationResponse(
  result: WebsiteReservationResult,
):
  | Readonly<{ status: 201; body: Created }>
  | Readonly<{ status: 200; body: Replayed }> {
  if (result.replayed || result.manageToken === null)
    return {
      status: 200,
      body: {
        reference: result.reference,
        status: result.status,
        manageUrl: null,
        ...(result.checkoutUrl ? { checkoutUrl: result.checkoutUrl } : {}),
      },
    };
  if (
    result.status === "AWAITING_PAYMENT" &&
    result.holdExpiresAt &&
    result.checkoutUrl
  )
    return {
      status: 201,
      body: {
        reference: result.reference,
        status: result.status,
        holdExpiresAt: result.holdExpiresAt.toISOString(),
        checkoutUrl: result.checkoutUrl,
        manageUrl: manageUrl(result.manageToken),
      },
    };
  if (result.status !== "CONFIRMED" || result.totalMinor === null)
    throw new Error(
      "A new website booking must have a confirmed total or an open checkout.",
    );
  return {
    status: 201,
    body: {
      reference: result.reference,
      status: result.status,
      total: { amountMinor: result.totalMinor, currency: "USD" },
      manageUrl: manageUrl(result.manageToken),
    },
  };
}

export function staffReservation(
  row: StaffReservationView,
): z.infer<typeof StaffReservationDetail> {
  const price = row.snapshot;
  return {
    id: row.id,
    branchId: row.branchId,
    reference: row.reference.value,
    status: row.status,
    source: row.source,
    stay: stayDto(row.stay),
    externalReference: row.externalReference,
    externalChannel: row.externalChannel,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    guest: row.contact,
    internalNotes: row.internalNotes,
    couponCode: row.couponCode,
    price: price
      ? {
          currency: "USD",
          accommodationMinor: price.accommodationMinor,
          servicesMinor: price.servicesMinor,
          subtotalMinor: price.subtotalMinor,
          discountMinor: price.discountMinor,
          taxableMinor: price.taxableMinor,
          vatRateBasisPoints: price.vatRateBasisPoints,
          vatMinor: price.vatMinor,
          totalMinor: price.totalMinor,
          services: price.serviceLines.map((line) => ({
            kind: line.kind,
            unit: line.unit,
            priceMinor: line.priceMinor,
            childPriceMinor: line.childPriceMinor,
            adultQuantity: line.adultQuantity,
            childQuantity: line.childQuantity,
            amountMinor: line.amountMinor,
            vehicles: line.vehicles,
            details: line.details,
          })),
        }
      : null,
    lines: row.lines.map((line) => ({
      id: line.id,
      roomTypeId: line.roomTypeId,
      physicalRoomId: line.physicalRoomId,
      stay: stayDto(line.stay),
      occupancy: {
        adults: line.occupancy.adults,
        children: line.occupancy.children,
      },
      subtotal: moneyDto(line.subtotal),
      consumesInventory: line.consumesInventory,
      nights: line.nights.map((night) => ({
        night: night.night.value,
        amount: moneyDto(night.amount),
        source: night.source,
        periodId: night.periodId,
        label: night.label,
      })),
    })),
    createdAt: row.createdAt.toISOString(),
    historySummary: {
      createdAt: row.createdAt.toISOString(),
      statusChangedAt: row.statusChangedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
    pmsEnteredAt: row.pmsEnteredAt?.toISOString() ?? null,
    pmsEnteredById: row.pmsEnteredById,
    changeSeq: row.changeSeq,
    pmsUpdatePendingSince: row.pmsUpdatePendingSince?.toISOString() ?? null,
    allowedActions: [...row.allowedActions],
  };
}

function stayDto(stay: StaffReservationView["stay"]) {
  return { checkIn: stay.checkIn.value, checkOut: stay.checkOut.value };
}

function moneyDto(
  amount: StaffReservationView["lines"][number]["subtotal"],
): MoneyDto | null {
  return amount
    ? { amountMinor: amount.amountMinor, currency: amount.currency }
    : null;
}
