import {
  WHATSAPP_SEND_LANGUAGE,
  type WhatsAppPurpose,
} from "./whatsapp-template";

/**
 * "WhatsApp configured" (Q-71, owner 2026-11-14): the business number, the
 * provider phone number id, the server access token, and an active `en`
 * template for both of these purposes. Other purposes are setup gaps that
 * do not block booking.
 */
export const WHATSAPP_REQUIRED_PURPOSES = [
  "VERIFICATION_CODE",
  "BOOKING_CONFIRMED",
] as const satisfies readonly WhatsAppPurpose[];

/** Purposes listed as gaps. Feedback and marketing belong to M13. */
export const WHATSAPP_SETUP_PURPOSES = [
  "VERIFICATION_CODE",
  "BOOKING_CONFIRMED",
  "PAYMENT_NOT_COMPLETED",
  "CANCELLATION_RECEIVED",
  "CANCELLATION_APPROVED",
  "CANCELLATION_REJECTED",
  "REFUND_COMPLETED",
  "CANCELLED_BY_HOTEL",
  "MANAGE_LINK",
  "RESERVATION_MODIFIED",
  "CHANGE_REQUEST_RECEIVED",
  "CHANGE_REQUEST_APPROVED",
  "CHANGE_REQUEST_REJECTED",
  "TEST",
] as const satisfies readonly WhatsAppPurpose[];

export type WhatsAppReadinessFacts = Readonly<{
  businessPhoneNumber: string | null;
  providerPhoneNumberId: string | null;
  accessTokenConfigured: boolean;
  activeTemplates: readonly Readonly<{
    purpose: string;
    language: string;
  }>[];
}>;

export type WhatsAppSetupGap = Readonly<{
  purpose: WhatsAppPurpose;
  language: string;
  /** True when the gap keeps WhatsApp from counting as configured. */
  blocking: boolean;
}>;

export type WhatsAppReadiness = Readonly<{
  configured: boolean;
  setupGaps: readonly WhatsAppSetupGap[];
}>;

export function whatsAppReadiness(
  facts: WhatsAppReadinessFacts,
): WhatsAppReadiness {
  const language = WHATSAPP_SEND_LANGUAGE;
  const active = new Set(
    facts.activeTemplates
      .filter((template) => template.language === language)
      .map((template) => template.purpose),
  );
  const required = new Set<string>(WHATSAPP_REQUIRED_PURPOSES);
  const setupGaps = WHATSAPP_SETUP_PURPOSES.filter(
    (purpose) => !active.has(purpose),
  ).map((purpose) => ({ purpose, language, blocking: required.has(purpose) }));
  const configured =
    facts.businessPhoneNumber !== null &&
    facts.providerPhoneNumberId !== null &&
    facts.accessTokenConfigured &&
    !setupGaps.some((gap) => gap.blocking);
  return { configured, setupGaps };
}
