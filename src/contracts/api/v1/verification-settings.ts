import { z } from "zod";

/** API-A9 `PUT` (Q-99). */
export const VerificationSettingsInput = z
  .object({
    emailVerificationEnabled: z
      .boolean()
      .describe(
        "Offer verification codes by email. Turning it on is refused while email delivery or online payment is not configured (a booking verified by email is paid online, Q-100). Turning it off stops new email codes; codes and tokens already issued may finish.",
      ),
  })
  .strict();

/** API-A9 response. */
export const VerificationSettings = z.object({
  emailVerificationEnabled: z.boolean(),
  emailDeliveryConfigured: z
    .boolean()
    .describe("Whether the server's email adapter can deliver."),
  onlinePaymentConfigured: z
    .boolean()
    .describe(
      "A payment gateway is configured. Bookings verified by email are paid online (Q-100).",
    ),
  whatsAppConfigured: z.boolean().describe("WhatsApp configured per Q-71."),
  emailChannelReady: z
    .boolean()
    .describe(
      "Email codes are offered: delivery configured and the switch on.",
    ),
  updatedAt: z.iso
    .datetime()
    .nullable()
    .describe("Null only if the settings row is missing, which reads as off."),
});
