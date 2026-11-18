import { z } from "zod";

// API-A6…A8 (M8-T4, Q-67). Kept equal to `src/domain/notifications` by a
// unit test; contracts import only zod (D-7).

export const WHATSAPP_PURPOSE_VALUES = [
  "VERIFICATION_CODE",
  "BOOKING_CONFIRMED",
  "PAYMENT_NOT_COMPLETED",
  "CANCELLATION_RECEIVED",
  "CANCELLATION_APPROVED",
  "CANCELLATION_REJECTED",
  "REFUND_COMPLETED",
  "CANCELLED_BY_HOTEL",
  "MANAGE_LINK",
  "FEEDBACK_REQUEST",
  "MARKETING",
  "TEST",
  "RESERVATION_MODIFIED",
  "CHANGE_REQUEST_RECEIVED",
  "CHANGE_REQUEST_APPROVED",
  "CHANGE_REQUEST_REJECTED",
] as const;
export const WHATSAPP_LANGUAGE_VALUES = ["en", "ar"] as const;
export const WHATSAPP_CATEGORY_VALUES = [
  "AUTHENTICATION",
  "UTILITY",
  "MARKETING",
] as const;

const instant = z.string().describe("UTC instant (ISO 8601).");

export const WhatsAppSettingsInput = z
  .object({
    businessPhoneNumber: z
      .string()
      .max(40)
      .nullable()
      .describe(
        "The hotel's WhatsApp Business number in international format (stored as E.164). Null or empty clears it, which turns sending off.",
      ),
    providerPhoneNumberId: z
      .string()
      .max(64)
      .nullable()
      .describe("The Meta Cloud API phone number id: digits only."),
  })
  .strict()
  .describe("The access token is never accepted here; it is a server secret.");

export const WhatsAppSetup = z.object({
  businessPhoneNumber: z.string().nullable(),
  providerPhoneNumberId: z.string().nullable(),
  accessTokenConfigured: z
    .boolean()
    .describe("Whether the server holds an access token. Never the token."),
  configured: z
    .boolean()
    .describe(
      "Q-71: number, phone number id, token, and active `en` templates for VERIFICATION_CODE and BOOKING_CONFIRMED.",
    ),
  setupGaps: z
    .array(
      z.object({
        purpose: z.enum(WHATSAPP_PURPOSE_VALUES),
        language: z.string(),
        blocking: z
          .boolean()
          .describe("True when the gap keeps WhatsApp from being configured."),
      }),
    )
    .describe("Message purposes without an active template."),
  lastTest: z
    .object({
      at: instant,
      ok: z.boolean(),
      error: z
        .string()
        .nullable()
        .describe("Provider text without secrets, or the setup gap."),
    })
    .nullable(),
  updatedAt: instant,
});

const templateFields = {
  purpose: z.enum(WHATSAPP_PURPOSE_VALUES),
  language: z.enum(WHATSAPP_LANGUAGE_VALUES),
  providerName: z
    .string()
    .max(120)
    .describe("The template name exactly as approved in Meta."),
  category: z
    .enum(WHATSAPP_CATEGORY_VALUES)
    .describe("VERIFICATION_CODE must be AUTHENTICATION."),
  variables: z
    .array(z.string().max(40))
    .max(12)
    .describe(
      "Ordered allowlisted keys: guestFirstName, reference, branchName, checkIn, checkOut, total, manageLink, code, holdExpiresAt, refundAmount, reason, feedbackLink. Each purpose allows a subset; unknown or disallowed keys return 422.",
    ),
  previewText: z
    .string()
    .max(1024)
    .describe("Staff facing preview; never sent."),
  active: z
    .boolean()
    .describe(
      "One active template per purpose and language (except MARKETING); a second returns 409.",
    ),
};

export const WhatsAppTemplateInput = z.object(templateFields).strict();
export const WhatsAppTemplatePatch = z
  .object(templateFields)
  .partial()
  .strict();

export const WhatsAppTemplate = z.object({
  id: z.string(),
  ...templateFields,
  createdAt: instant,
  updatedAt: instant,
});

export const WhatsAppTemplateList = z.object({
  items: z.array(WhatsAppTemplate),
});

export const WhatsAppTestMessageInput = z
  .object({
    phone: z
      .string()
      .max(40)
      .describe("Recipient in international format; never stored."),
    templateId: z
      .string()
      .max(32)
      .optional()
      .describe("A stored template; default: the active `en` TEST template."),
  })
  .strict();

export const WhatsAppTestMessageResult = z.object({
  ok: z.literal(true),
  providerMessageId: z.string(),
});
