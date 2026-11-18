import "server-only";

import type {
  WhatsAppDelivery,
  WhatsAppTransport,
  WhatsAppTransportResult,
} from "@/application/notifications";

/** A fictional number the fake always refuses, to exercise the failure path. */
export const FAKE_WHATSAPP_REJECTED_NUMBER = "+12025550199";

/**
 * Development and test stand in for Meta (`WHATSAPP_PROVIDER=fake`, refused
 * in production). It records deliveries in memory only: no file, table, or
 * log line, so no phone number or code is written anywhere.
 */
export class FakeWhatsAppTransport implements WhatsAppTransport {
  readonly deliveries: WhatsAppDelivery[] = [];
  private sent = 0;

  async deliver(delivery: WhatsAppDelivery): Promise<WhatsAppTransportResult> {
    if (delivery.to.value === FAKE_WHATSAPP_REJECTED_NUMBER) {
      return {
        ok: false,
        code: "PROVIDER_REJECTED",
        detail: "Fake WhatsApp provider: this test number is always refused.",
      };
    }
    this.deliveries.push(delivery);
    // Bounded, so a long running development server does not grow it.
    if (this.deliveries.length > 100) this.deliveries.shift();
    this.sent += 1;
    return { ok: true, providerMessageId: `fake-${this.sent}` };
  }
}
