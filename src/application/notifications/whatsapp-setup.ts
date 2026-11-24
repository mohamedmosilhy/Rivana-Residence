import {
  whatsAppReadiness,
  WHATSAPP_PURPOSE_VARIABLES,
  type WhatsAppReadiness,
} from "@/domain/notifications";

import type {
  WhatsAppSettingsRecord,
  WhatsAppSettingsRepository,
  WhatsAppTemplateRepository,
} from "./ports";

/** What API-A6 `GET` shows. The access token is reported only as a flag. */
export type WhatsAppSetupView = WhatsAppSettingsRecord &
  WhatsAppReadiness &
  Readonly<{ accessTokenConfigured: boolean }>;

export type WhatsAppSetupReaderDeps = Readonly<{
  settings: WhatsAppSettingsRepository;
  templates: WhatsAppTemplateRepository;
  accessTokenConfigured: boolean;
}>;

/**
 * Reads the setup and whether it counts as configured (Q-71). Used by the
 * settings screen and by the branch use case, which refuses to turn online
 * booking on while WhatsApp is not configured.
 */
export class WhatsAppSetupReader {
  constructor(private readonly deps: WhatsAppSetupReaderDeps) {}

  async read(): Promise<WhatsAppSetupView> {
    const [settings, templates] = await Promise.all([
      this.deps.settings.read(),
      this.deps.templates.list(),
    ]);
    const readiness = whatsAppReadiness({
      businessPhoneNumber: settings.businessPhoneNumber,
      providerPhoneNumberId: settings.providerPhoneNumberId,
      accessTokenConfigured: this.deps.accessTokenConfigured,
      activeTemplates: templates.filter(
        (template) =>
          template.active &&
          (template.purpose !== "CANCELLATION_RECEIVED" ||
            template.variables.every((key) =>
              WHATSAPP_PURPOSE_VARIABLES.CANCELLATION_RECEIVED.includes(key),
            )),
      ),
    });
    return {
      ...settings,
      ...readiness,
      accessTokenConfigured: this.deps.accessTokenConfigured,
    };
  }

  async isConfigured(): Promise<boolean> {
    return (await this.read()).configured;
  }
}
