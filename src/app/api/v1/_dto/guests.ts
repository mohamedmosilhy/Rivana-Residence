import type { ChangeRequestDto } from "@/contracts/api/v1/change-requests";
import type { z } from "zod";

import type { GuestListItem, GuestView } from "@/application/guests";
import type {
  GuestCancellationRequest,
  GuestChangeRequest,
  GuestReservationSummary as GuestReservationSummaryRow,
  GuestReservationView,
} from "@/application/reservations";
import type {
  CancellationRequest,
  GuestDetail,
  GuestReservation,
  GuestReservationSummary,
} from "@/contracts/api/v1/guests";

const iso = (value: Date | null) => value?.toISOString() ?? null;

export function guestListItem(item: GuestListItem) {
  return item;
}

export function guestDetail(view: GuestView): z.infer<typeof GuestDetail> {
  const { guest } = view;
  return {
    id: guest.id,
    phone: guest.phone,
    name: guest.name,
    email: guest.email,
    verified: guest.phoneVerifiedAt !== null,
    phoneVerifiedAt: iso(guest.phoneVerifiedAt),
    marketingOptInAt: iso(guest.marketingOptInAt),
    marketingOptOutAt: iso(guest.marketingOptOutAt),
    blocked: guest.blockedAt !== null,
    blockedAt: iso(guest.blockedAt),
    blockedById: guest.blockedById,
    blockReason: guest.blockReason,
    createdAt: guest.createdAt.toISOString(),
    reservations: view.reservations.map((item) => ({ ...item })),
    blockHistory: view.history.map((item) => ({ ...item })),
  };
}

export function guestReservationSummary(
  row: GuestReservationSummaryRow,
): z.infer<typeof GuestReservationSummary> {
  return {
    reference: row.reference,
    status: row.status,
    branchName: row.branchName,
    branchSlug: row.branchSlug,
    stay: row.stay,
    units: row.units,
    total:
      row.totalMinor === null
        ? null
        : { amountMinor: row.totalMinor, currency: "USD" },
    createdAt: row.createdAt.toISOString(),
  };
}

const money = (value: { amountMinor: number } | null) =>
  value === null
    ? null
    : { amountMinor: value.amountMinor, currency: "USD" as const };

export function cancellationRequest(
  row: GuestCancellationRequest,
): z.infer<typeof CancellationRequest> {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decisionReason: row.decisionReason,
  };
}

export function changeRequest(
  row: GuestChangeRequest,
): z.infer<typeof ChangeRequestDto> {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export function guestReservation(
  view: GuestReservationView,
): z.infer<typeof GuestReservation> {
  const price = view.price;
  return {
    reference: view.reference,
    status: view.status,
    paymentMethod: view.paymentMethod,
    paymentStatus: view.paymentStatus,
    branch: view.branch,
    stay: {
      checkIn: view.stay.checkIn.value,
      checkOut: view.stay.checkOut.value,
    },
    units: view.units.map((unit) => ({
      roomName: unit.roomName,
      occupancy: {
        adults: unit.occupancy.adults,
        children: unit.occupancy.children,
      },
      subtotal: money(unit.subtotal),
    })),
    contact: view.contact,
    price: price && {
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
        amountMinor: line.amountMinor,
        vehicles: line.vehicles,
        details: line.details,
      })),
    },
    cancellationDeadline: iso(view.cancellationDeadline),
    cancellationRequest:
      view.currentCancellationRequest &&
      cancellationRequest(view.currentCancellationRequest),
    changeRequest:
      view.currentChangeRequest && changeRequest(view.currentChangeRequest),
    allowedActions: [...view.allowedActions],
    createdAt: view.createdAt.toISOString(),
  };
}
