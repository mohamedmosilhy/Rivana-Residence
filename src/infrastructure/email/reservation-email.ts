import "server-only";
import type { Transporter } from "nodemailer";
import type {
  DeliveryResult,
  MessageKind,
  MessageVariables,
  ReservationEmailSender,
} from "@/application/notifications";
import { headerText } from "./smtp-contact-delivery";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderReservationEmail(
  kind: MessageKind,
  vars: MessageVariables,
) {
  const heading = {
    "reservation.confirmed": "Your reservation is confirmed",
    "reservation.cancelled": "The hotel has cancelled your reservation",
    "reservation.modified": "Your reservation was changed",
    "reservation.manage-link": "Your reservation manage link",
    "reservation.payment-not-completed": "Your payment was not completed",
    "reservation.staff-alert": "New confirmed website reservation",
    "reservation.change-staff-alert": "A guest changed a reservation",
    "reservation.email-changed": "Your reservation email address was changed",
    "cancellation-request.received": "We received your cancellation request",
    "cancellation-request.approved": "Your cancellation request was approved",
    "cancellation-request.rejected": "Your cancellation request was declined",
    "payment.refunded": "Your reservation is cancelled and refunded",
    "refund.staff-alert": "A refund failed and needs attention",
    "payment.duplicate-alert": "A possible double payment needs attention",
    "refund.moved-on-alert": "A refund was paid for a booking that moved on",
    "request.staff-alert": "New reservation cancellation request",
    "payment.auto-refunded": "Your payment is being refunded",
    "payment.staff-alert": "A late payment was refunded automatically",
  }[kind];
  if (kind === "reservation.email-changed") {
    const contact = [vars.hotelPhone, vars.hotelEmail]
      .filter(Boolean)
      .join(" or ");
    const lines = [
      heading,
      `If you did not make this change, contact ${vars.branchName}${contact ? ` at ${contact}` : ""}.`,
    ];
    return {
      subject: heading,
      text: lines.join("\n\n"),
      html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n"),
    };
  }
  const lines = [heading, `${vars.branchName} · ${vars.reference}`];
  if (kind === "reservation.staff-alert")
    lines.push("Please enter this booking in the hotel system.");
  else if (kind === "cancellation-request.received")
    lines.push("Submitting a request does not cancel your reservation.");
  else if (kind === "cancellation-request.approved")
    lines.push(
      vars.refundAmount
        ? `Your reservation stays active until the refund of ${vars.refundAmount} is confirmed. We will message you then.`
        : "Your reservation is cancelled.",
    );
  else if (kind === "cancellation-request.rejected")
    lines.push(
      "Your reservation is not cancelled.",
      ...(vars.reason ? [`Reason: ${vars.reason}`] : []),
    );
  else if (kind === "payment.refunded")
    lines.push(
      `Your reservation is cancelled. We refunded ${vars.refundAmount ?? "the full amount"} to your original payment method.`,
    );
  else if (kind === "refund.staff-alert")
    lines.push(
      `The refund of ${vars.refundAmount ?? "this booking"} was refused by the payment gateway. Check the booking, then retry the refund from the payments of this reservation.`,
    );
  else if (kind === "refund.moved-on-alert")
    lines.push(
      `A cancellation refund of ${vars.refundAmount ?? "this booking"} was completed after the guest was already checked in or marked as a no-show. The booking was not cancelled. Review it and recover the money if needed.`,
    );
  else if (kind === "payment.duplicate-alert")
    lines.push(
      `The payment gateway reported a second successful payment of ${vars.chargedAmount ?? "the booking amount"}. Check the gateway and refund the guest if the guest was charged twice.`,
    );
  else if (kind === "request.staff-alert")
    lines.push("Please review the cancellation request for this reservation.");
  else if (kind === "payment.auto-refunded")
    lines.push(
      "Your payment arrived after the room was released and the room was no longer available.",
      `We are refunding ${vars.refundAmount ?? "the full amount"} to your original payment method.`,
    );
  else if (kind === "payment.staff-alert")
    lines.push(
      `A guest payment arrived after the hold ended and the room was already sold. The full ${vars.refundAmount ?? "amount"} is being refunded. Contact the guest if needed.`,
    );
  else if (kind === "reservation.payment-not-completed")
    lines.push("Your booking is no longer held.");
  else {
    if (kind === "reservation.change-staff-alert")
      lines.push(
        "Please review the change and update the hotel system if needed.",
      );
    if (vars.previousCheckIn && vars.previousCheckOut)
      lines.push(
        `Previous stay: ${vars.previousCheckIn} to ${vars.previousCheckOut}`,
      );
    if (vars.previousTotal) lines.push(`Previous total: ${vars.previousTotal}`);
    if (vars.checkIn && vars.checkOut)
      lines.push(`Stay: ${vars.checkIn} to ${vars.checkOut}`);
    if (vars.total) lines.push(`Total: ${vars.total}`);
    if (vars.reason) lines.push(`Reason: ${vars.reason}`);
  }
  const html = lines.map((line) => `<p>${escapeHtml(line)}</p>`);
  if (
    kind !== "reservation.staff-alert" &&
    kind !== "reservation.change-staff-alert" &&
    kind !== "request.staff-alert" &&
    kind !== "payment.staff-alert" &&
    kind !== "refund.staff-alert" &&
    kind !== "payment.duplicate-alert" &&
    kind !== "refund.moved-on-alert" &&
    vars.manageLink
  ) {
    lines.push(`Manage your reservation: ${vars.manageLink}`);
    html.push(
      `<p><a href="${escapeHtml(vars.manageLink)}">Manage your reservation</a></p>`,
    );
  }
  return {
    subject: headerText(`${heading} · ${vars.reference}`, 150),
    text: lines.join("\n\n"),
    html: html.join("\n"),
  };
}

export class SmtpReservationEmail implements ReservationEmailSender {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}
  async send(
    id: string,
    to: string,
    kind: MessageKind,
    vars: MessageVariables,
  ): Promise<DeliveryResult> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: { name: "", address: to },
        messageId: `<${id}@${this.from.split("@")[1]}>`,
        ...renderReservationEmail(kind, vars),
      });
      return { ok: true };
    } catch (error) {
      const response =
        error && typeof error === "object" && "responseCode" in error
          ? error.responseCode
          : undefined;
      const providerCode =
        typeof response === "number" && response >= 400 && response <= 599
          ? response
          : undefined;
      return {
        ok: false,
        code:
          providerCode && providerCode >= 500
            ? "PROVIDER_REJECTED"
            : "UNAVAILABLE",
        providerCode,
      };
    }
  }
}
