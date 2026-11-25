import { z } from "zod";
import type { Clock } from "@/application/shared/providers";
import { PhoneNumber } from "@/domain/guests";
import { WHATSAPP_SEND_LANGUAGE } from "@/domain/notifications";
import type {
  WhatsAppSender,
  ClaimedMessage,
  DeliveryResult,
  Completion,
  OutboxWorkerStore,
  ReservationEmailSender,
  MessageVariables,
} from "./ports";

export const RETRY_MINUTES = [1, 5, 15, 60, 240] as const;
export const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;
const purposes = {
  "reservation.confirmed": "BOOKING_CONFIRMED",
  "reservation.cancelled": "CANCELLED_BY_HOTEL",
  "reservation.modified": "RESERVATION_MODIFIED",
  "reservation.manage-link": "MANAGE_LINK",
  "reservation.payment-not-completed": "PAYMENT_NOT_COMPLETED",
  "cancellation-request.received": "CANCELLATION_RECEIVED",
  "cancellation-request.approved": "CANCELLATION_APPROVED",
  "cancellation-request.rejected": "CANCELLATION_REJECTED",
  "payment.refunded": "REFUND_COMPLETED",
  // Q-63: the late success wording of the refund message shares its template.
  "payment.auto-refunded": "REFUND_COMPLETED",
} as const;
const variables = z.strictObject({
  reference: z.string(),
  branchName: z.string(),
  guestFirstName: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  total: z.string().optional(),
  previousCheckIn: z.string().optional(),
  previousCheckOut: z.string().optional(),
  previousTotal: z.string().optional(),
  hotelPhone: z.string().optional(),
  hotelEmail: z.string().optional(),
  reason: z.string().optional(),
  holdExpiresAt: z.iso.datetime().optional(),
  refundAmount: z.string().optional(),
  chargedAmount: z.string().optional(),
  // Not `z.httpUrl()`: it needs a dotted domain, so it would refuse the
  // `localhost` and IP `APP_URL` that development and staging use.
  manageLink: z.url({ protocol: /^https?$/ }).optional(),
});
function validVariables(input: unknown): input is MessageVariables {
  return variables.safeParse(input).success;
}
const kinds = z.enum([
  "reservation.confirmed",
  "reservation.cancelled",
  "reservation.modified",
  "reservation.manage-link",
  "reservation.payment-not-completed",
  "reservation.staff-alert",
  "reservation.change-staff-alert",
  "reservation.email-changed",
  "cancellation-request.received",
  "cancellation-request.approved",
  "cancellation-request.rejected",
  "payment.refunded",
  "request.staff-alert",
  "payment.auto-refunded",
  "payment.staff-alert",
  "refund.staff-alert",
  "payment.duplicate-alert",
  "refund.moved-on-alert",
]);
export class DispatchOutbox {
  constructor(
    private readonly store: OutboxWorkerStore,
    private readonly email: ReservationEmailSender,
    private readonly whatsapp: WhatsAppSender,
    private readonly clock: Clock,
  ) {}
  async run(limit = 50) {
    const counts = { sent: 0, failed: 0, retried: 0, stale: 0 };
    for (let i = 0; i < limit; i++) {
      const message = await this.store.claim(this.clock.now());
      if (message === null) break;
      if (message === "exhausted") {
        counts.failed++;
        continue;
      }
      const result = await this.deliver(message).catch(
        (): DeliveryResult => ({ ok: false, code: "UNAVAILABLE" }),
      );
      const outcome = completion(result, message.attempts, this.clock.now());
      if (!(await this.store.complete(message, outcome))) counts.stale++;
      else if (outcome.status === "SENT") counts.sent++;
      else if (outcome.status === "FAILED") counts.failed++;
      else counts.retried++;
    }
    return counts;
  }
  private async deliver(message: ClaimedMessage): Promise<DeliveryResult> {
    const payload = message.payload;
    const kind = kinds.safeParse(message.kind);
    const invalid = { ok: false, code: "INVALID_MESSAGE" } as const;
    if (!validVariables(payload) || !kind.success) return invalid;
    if (kind.data === "reservation.manage-link" && !payload.manageLink)
      return invalid;
    if (message.channel === "EMAIL") {
      if (!z.email().safeParse(message.recipient).success) return invalid;
      return this.email.send(message.id, message.recipient, kind.data, payload);
    }
    if (
      kind.data === "reservation.staff-alert" ||
      kind.data === "reservation.change-staff-alert" ||
      kind.data === "reservation.email-changed" ||
      kind.data === "request.staff-alert" ||
      kind.data === "payment.staff-alert" ||
      kind.data === "refund.staff-alert" ||
      kind.data === "payment.duplicate-alert" ||
      kind.data === "refund.moved-on-alert"
    )
      return invalid;
    let phone: PhoneNumber;
    try {
      phone = PhoneNumber.parse(message.recipient);
    } catch {
      return invalid;
    }
    return this.whatsapp.send({
      purpose: purposes[kind.data],
      language: WHATSAPP_SEND_LANGUAGE,
      to: phone,
      variables: payload,
    });
  }
}
function completion(
  result: DeliveryResult,
  attempt: number,
  now: Date,
): Completion {
  if (result.ok) return { status: "SENT", sentAt: now };
  const code = result.providerCode;
  const lastError =
    code !== undefined &&
    Number.isSafeInteger(code) &&
    code >= 0 &&
    code <= 999999
      ? `${result.code} ${code}`
      : result.code;
  const delay = RETRY_MINUTES[attempt - 1];
  if (
    delay !== undefined &&
    (result.code === "RATE_LIMITED" || result.code === "UNAVAILABLE")
  )
    return {
      status: "PENDING",
      lastError,
      availableAt: new Date(now.getTime() + delay * 60_000),
    };
  return { status: "FAILED", lastError };
}
