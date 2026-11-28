import { formatMoney } from "@/presentation/format/money";

import type { BookingDetail } from "./booking-details";
import { displayInstant } from "./display-date";

// Plain words for what the server reports about a booking and its requests.
// The server decides what a guest may do; this only explains it.

const reservationStatuses: Record<string, string> = {
  AWAITING_PAYMENT: "waiting for payment",
  CONFIRMED: "confirmed",
  PAYMENT_FAILED: "payment not completed",
  CANCELLED: "cancelled",
  CHECKED_IN: "checked in",
  CHECKED_OUT: "stay completed",
  NO_SHOW: "marked as not arrived",
};

const paymentStatuses: Record<string, string> = {
  NOT_REQUIRED: "No online payment",
  AWAITING: "Waiting for payment",
  PAID: "Paid online",
  REFUND_PENDING: "Refund requested",
  REFUNDED: "Refunded",
  FAILED: "Payment not completed",
};

const fallback = (value: string) => value.replaceAll("_", " ").toLowerCase();

/** Lower case, to follow "Current status:" or to be capitalised by CSS. */
export const reservationStatusText = (status: string) =>
  reservationStatuses[status] ?? fallback(status);

export const paymentStatusText = (status: string) =>
  paymentStatuses[status] ?? fallback(status);

export type RequestNote = Readonly<{
  title: string;
  lines: readonly string[];
}>;

const hotelReason = (reason: string | null) =>
  reason ? [`The hotel’s note: ${reason}`] : [];

/** The latest cancellation request, in every state it can be in. */
export function cancellationNote(booking: BookingDetail): RequestNote | null {
  const { cancellationRequest: request } = booking;
  if (!request) return null;
  const confirmed = booking.status === "CONFIRMED";
  const stays = confirmed ? ["Your booking is still confirmed."] : [];
  const note = (title: string, lines: readonly string[]) => ({
    title,
    lines: [...lines, ...hotelReason(request.decisionReason)],
  });
  switch (request.status) {
    case "OPEN":
      return note("Cancellation requested", [
        "Waiting for the hotel’s decision.",
        ...stays,
      ]);
    case "APPROVED":
      return note("Cancellation approved", [
        "The hotel approved your request and is completing it.",
      ]);
    case "REFUND_PENDING":
      return note("Approved, refund requested", [
        "Your booking is cancelled once the refund completes.",
      ]);
    case "REFUND_FAILED":
      return note("The refund has not gone through yet", [
        "The hotel approved your request. Contact the hotel about the refund.",
        ...stays,
      ]);
    case "COMPLETED":
      return note("Cancellation completed", [
        "Your booking was cancelled.",
        ...(booking.paymentStatus === "REFUNDED"
          ? ["Your payment was refunded."]
          : []),
      ]);
    case "REJECTED":
      return note("Cancellation request declined", stays);
    case "CLOSED":
      return note("Cancellation request closed", [
        "This request is no longer open.",
      ]);
  }
}

/** The latest change request. Changing a booking online arrives in M10-T8b. */
export function changeNote(booking: BookingDetail): RequestNote | null {
  const { changeRequest: request } = booking;
  if (!request) return null;
  const note = (title: string, lines: readonly string[]) => ({
    title,
    lines: [...lines, ...hotelReason(request.decisionReason)],
  });
  switch (request.status) {
    case "OPEN":
      return note("Change sent to the hotel", [
        "Waiting for the hotel’s decision. Your booking has not changed.",
        `Requested new total: ${formatMoney(request.previewTotalMinor)}`,
      ]);
    case "APPROVED":
      return note("Change approved", [
        "The details above include the approved change.",
      ]);
    case "REJECTED":
      return note("Change declined", ["Your booking was not changed."]);
    case "CLOSED":
      return note("Change request closed", ["This request is no longer open."]);
  }
}

const activeCancellation = [
  "OPEN",
  "APPROVED",
  "REFUND_PENDING",
  "REFUND_FAILED",
];

/**
 * Why a confirmed booking has no "Request cancellation" button. The device
 * clock only picks the sentence. A blocked number is never mentioned.
 */
export function noCancellationReason(
  booking: BookingDetail,
  nowMs: number,
): string | null {
  if (booking.status !== "CONFIRMED") return null;
  const { cancellationRequest: request, changeRequest: change } = booking;
  // The request's own note already says what is happening.
  if (request && activeCancellation.includes(request.status)) return null;
  if (change?.status === "OPEN")
    return "You can ask to cancel after the hotel answers your change request. If it can’t wait, contact the hotel.";
  const deadline = booking.cancellationDeadline;
  if (deadline && nowMs >= Date.parse(deadline))
    return `Online cancellation closed on ${displayInstant(deadline, booking.branch.timeZone)} (hotel time). Contact the hotel about cancelling.`;
  if (booking.paymentStatus === "REFUND_PENDING")
    return "A refund is in progress. Contact the hotel about this booking.";
  return "To cancel this booking, contact the hotel.";
}
