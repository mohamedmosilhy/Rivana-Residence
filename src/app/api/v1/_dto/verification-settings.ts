import type { VerificationSettingsView } from "@/application/guests";
import type { VerificationSettings } from "@/contracts/api/v1/verification-settings";
import type { z } from "zod";

/** API-A9, built field by field. */
export function verificationSettings(
  view: VerificationSettingsView,
): z.infer<typeof VerificationSettings> {
  return {
    emailVerificationEnabled: view.emailVerificationEnabled,
    emailDeliveryConfigured: view.emailDeliveryConfigured,
    whatsAppConfigured: view.whatsAppConfigured,
    emailChannelReady: view.emailChannelReady,
    updatedAt: view.updatedAt?.toISOString() ?? null,
  };
}
