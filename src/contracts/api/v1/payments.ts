import { z } from "zod";

// API-P8. The request is the payment gateway's own payload: the adapter
// verifies and translates it, so the contract defines only the answer.
export const PaymentCallbackAck = z.object({ received: z.literal(true) });
