import "server-only";

import { paymentGatewayReadiness } from "./payment-gateway";
import { reservationEmailReadiness } from "./reservation-email";
import { whatsAppTransportReadiness } from "./whatsapp-sender";

export function readProviderReadiness() {
  return {
    payment: paymentGatewayReadiness(),
    whatsapp: whatsAppTransportReadiness(),
    email: reservationEmailReadiness(),
  } as const;
}
