import "server-only";

import { reservationEmailReadiness } from "./reservation-email";
import { whatsAppTransportReadiness } from "./whatsapp-sender";

export function readProviderReadiness() {
  return {
    // M9-T3 registers the first payment adapter.
    payment: "unconfigured",
    whatsapp: whatsAppTransportReadiness(),
    email: reservationEmailReadiness(),
  } as const;
}
