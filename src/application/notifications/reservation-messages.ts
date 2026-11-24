import type { Clock, IdGenerator } from "@/application/shared/providers";
import type {
  ReservationMessageStore,
  ReservationMessageEvent,
  MessageVariables,
  OutgoingMessage,
  MessageChannel,
  MessageKind,
} from "./ports";

export class QueueReservationMessages {
  constructor(
    private readonly store: ReservationMessageStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly appUrl: string,
  ) {}
  discardHeld(reservationId: string) {
    return this.store.discardHeld(reservationId);
  }
  heldMessages(reservationId: string) {
    return this.store.listHeld(reservationId);
  }
  /** Held rows become dispatchable only when the transaction confirms the booking. */
  releaseHeld(reservationId: string) {
    return this.store.releaseHeld(reservationId, this.clock.now());
  }

  async enqueue(
    branchId: string,
    reservationId: string,
    event: ReservationMessageEvent,
  ) {
    const booking = await this.store.snapshot(branchId, reservationId);
    const websiteConfirmation =
      event.kind === "reservation.confirmed" && booking.source === "WEBSITE";
    const held = event.kind === "reservation.confirmed" && event.held === true;
    if (
      event.kind === "reservation.confirmed" &&
      (held
        ? !websiteConfirmation || booking.status !== "AWAITING_PAYMENT"
        : booking.status !== "CONFIRMED")
    )
      return;
    if (
      event.kind === "reservation.payment-not-completed" &&
      booking.status !== "PAYMENT_FAILED"
    )
      return;
    // A payment that reaches a failed or cancelled booking is refunded, and both
    // the guest and the hotel are told.
    if (
      (event.kind === "payment.auto-refunded" ||
        event.kind === "payment.staff-alert") &&
      booking.status !== "PAYMENT_FAILED" &&
      booking.status !== "CANCELLED"
    )
      return;
    if (
      event.kind === "reservation.cancelled" &&
      booking.status !== "CANCELLED"
    )
      return;
    if (event.kind === "reservation.modified" && booking.status !== "CONFIRMED")
      return;
    if ("notifyGuest" in event && !event.notifyGuest && !websiteConfirmation)
      return;

    if (
      (websiteConfirmation || event.kind === "reservation.manage-link") &&
      !event.manageToken
    ) {
      throw new Error(
        "A manage token is required for this reservation message.",
      );
    }

    const summary = {
      reference: booking.reference,
      branchName: booking.branchName,
    };
    const payload: MessageVariables = {
      ...summary,
      guestFirstName: booking.guestName.trim().split(/\s+/u)[0] ?? "",
    };
    if (event.kind === "reservation.payment-not-completed") {
      payload.holdExpiresAt = event.holdExpiresAt.toISOString();
    } else if (
      event.kind === "payment.auto-refunded" ||
      event.kind === "payment.staff-alert"
    ) {
      payload.refundAmount = `USD ${(event.refundMinor / 100).toFixed(2)}`;
    } else if (event.kind !== "reservation.manage-link") {
      payload.checkIn = booking.checkIn;
      payload.checkOut = booking.checkOut;
    }
    if (
      (event.kind === "reservation.confirmed" ||
        event.kind === "reservation.modified") &&
      booking.totalMinor !== null
    )
      payload.total = `USD ${(booking.totalMinor / 100).toFixed(2)}`;
    if (event.kind === "reservation.cancelled") payload.reason = event.reason;
    if ("manageToken" in event && event.manageToken) {
      const url = new URL("/reservations/manage", this.appUrl);
      url.hash = "t=" + encodeURIComponent(event.manageToken);
      payload.manageLink = url.href;
    }
    const messages: OutgoingMessage[] = [];
    const availableAt = this.clock.now();
    const add = (
      channel: MessageChannel,
      kind: MessageKind,
      recipient: string,
      variables: MessageVariables,
    ) => {
      messages.push({
        id: this.ids.next(),
        reservationId,
        channel,
        kind,
        recipient,
        payload: variables,
        availableAt,
        ...(held ? { status: "HELD" } : {}),
      });
    };
    if (event.kind === "request.staff-alert") {
      // An absent inbox is visible as a failed outbox row, as for new bookings.
      add("EMAIL", event.kind, booking.branchEmail ?? "", summary);
      await this.store.append(messages);
      return;
    }
    if (event.kind === "payment.staff-alert") {
      add("EMAIL", event.kind, booking.branchEmail ?? "", payload);
      await this.store.append(messages);
      return;
    }
    if (booking.guestEmail)
      add("EMAIL", event.kind, booking.guestEmail, payload);
    if (booking.guestPhone)
      add("WHATSAPP", event.kind, booking.guestPhone, payload);
    // Preserve a visible delivery failure when the branch has no inbox.
    if (websiteConfirmation)
      add(
        "EMAIL",
        "reservation.staff-alert",
        booking.branchEmail ?? "",
        summary,
      );
    await this.store.append(messages);
  }
}
