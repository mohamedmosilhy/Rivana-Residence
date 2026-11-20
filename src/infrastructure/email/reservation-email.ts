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
    "reservation.manage-link": "Your reservation manage link",
    "reservation.staff-alert": "New confirmed website reservation",
  }[kind];
  const lines = [heading, `${vars.branchName} · ${vars.reference}`];
  if (kind === "reservation.staff-alert")
    lines.push("Please enter this booking in the hotel system.");
  else {
    if (vars.checkIn && vars.checkOut)
      lines.push(`Stay: ${vars.checkIn} to ${vars.checkOut}`);
    if (vars.total) lines.push(`Total: ${vars.total}`);
    if (vars.reason) lines.push(`Reason: ${vars.reason}`);
  }
  const html = lines.map((line) => `<p>${escapeHtml(line)}</p>`);
  if (kind !== "reservation.staff-alert" && vars.manageLink) {
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
