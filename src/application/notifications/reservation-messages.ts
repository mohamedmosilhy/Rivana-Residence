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
  async enqueue(
    branchId: string,
    reservationId: string,
    event: ReservationMessageEvent,
  ) {
    const booking = await this.store.snapshot(branchId, reservationId);
    const websiteConfirmation =
      event.kind === "reservation.confirmed" && booking.source === "WEBSITE";
    if (
      event.kind === "reservation.confirmed" &&
      booking.status !== "CONFIRMED"
    )
      return;
    if (
      event.kind === "reservation.cancelled" &&
      booking.status !== "CANCELLED"
    )
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
    if (event.kind !== "reservation.manage-link") {
      payload.checkIn = booking.checkIn;
      payload.checkOut = booking.checkOut;
    }
    if (event.kind === "reservation.confirmed" && booking.totalMinor !== null)
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
      });
    };
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
