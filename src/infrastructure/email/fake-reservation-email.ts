import "server-only";

import type {
  DeliveryResult,
  MessageKind,
  MessageVariables,
  ReservationEmailSender,
} from "@/application/notifications";

/** A reserved test address for simulating a permanent delivery failure. */
export const FAKE_EMAIL_REJECTED_ADDRESS = "rejected@example.test";

type EmailDelivery = Readonly<{
  id: string;
  to: string;
  kind: MessageKind;
  variables: Readonly<MessageVariables>;
}>;

/** Records a bounded history in this process for development and tests. */
export class FakeReservationEmail implements ReservationEmailSender {
  readonly deliveries: EmailDelivery[] = [];

  async send(
    id: string,
    to: string,
    kind: MessageKind,
    variables: MessageVariables,
  ): Promise<DeliveryResult> {
    if (to === FAKE_EMAIL_REJECTED_ADDRESS)
      return { ok: false, code: "PROVIDER_REJECTED" };
    this.deliveries.push({ id, to, kind, variables: { ...variables } });
    if (this.deliveries.length > 100) this.deliveries.shift();
    return { ok: true };
  }
}
