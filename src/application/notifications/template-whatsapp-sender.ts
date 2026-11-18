import type { PhoneNumber } from "@/domain/guests";
import type { WhatsAppVariableKey } from "@/domain/notifications";

import type {
  WhatsAppMessage,
  WhatsAppSender,
  WhatsAppSendResult,
  WhatsAppSettingsRecord,
  WhatsAppSettingsRepository,
  WhatsAppTemplateRecord,
  WhatsAppTemplateRepository,
  WhatsAppTransport,
} from "./ports";

export const WHATSAPP_NOT_CONFIGURED_DETAIL =
  "WhatsApp is not set up: the business number, the phone number id, or the access token is missing.";
export const WHATSAPP_TEMPLATE_MISSING_DETAIL =
  "There is no active WhatsApp template for this message.";

export type TemplateWhatsAppSenderDeps = Readonly<{
  settings: WhatsAppSettingsRepository;
  templates: WhatsAppTemplateRepository;
  transport: WhatsAppTransport;
  /** From the server environment; the token itself stays in the transport. */
  accessTokenConfigured: boolean;
}>;

type Variables = Readonly<Partial<Record<WhatsAppVariableKey, string>>>;

/**
 * Resolves a purpose and language to the active template, orders the values
 * by the template's variable list, and hands the message to the transport
 * (spec 0005 Decision 6). Missing setup or template sends nothing.
 */
export class TemplateWhatsAppSender implements WhatsAppSender {
  constructor(private readonly deps: TemplateWhatsAppSenderDeps) {}

  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    const settings = await this.deps.settings.read();
    const phoneNumberId = this.sendingNumberId(settings);
    if (phoneNumberId === null) return notConfigured();
    const template = await this.deps.templates.findActive(
      message.purpose,
      message.language,
    );
    if (!template) {
      return {
        ok: false,
        code: "TEMPLATE_MISSING",
        detail: WHATSAPP_TEMPLATE_MISSING_DETAIL,
      };
    }
    return this.deliver(phoneNumberId, template, message.to, message.variables);
  }

  /** Sends one stored template, active or not (the Admin's test message). */
  async sendTemplate(
    template: WhatsAppTemplateRecord,
    to: PhoneNumber,
    variables: Variables,
  ): Promise<WhatsAppSendResult> {
    const settings = await this.deps.settings.read();
    const phoneNumberId = this.sendingNumberId(settings);
    if (phoneNumberId === null) return notConfigured();
    return this.deliver(phoneNumberId, template, to, variables);
  }

  /** Sending is off while the number, the id, or the token is missing. */
  private sendingNumberId(settings: WhatsAppSettingsRecord): string | null {
    if (
      !this.deps.accessTokenConfigured ||
      settings.businessPhoneNumber === null ||
      settings.providerPhoneNumberId === null
    ) {
      return null;
    }
    return settings.providerPhoneNumberId;
  }

  private async deliver(
    phoneNumberId: string,
    template: WhatsAppTemplateRecord,
    to: PhoneNumber,
    variables: Variables,
  ): Promise<WhatsAppSendResult> {
    const parameters: string[] = [];
    for (const key of template.variables) {
      const value = variables[key];
      if (value === undefined) {
        return {
          ok: false,
          code: "TEMPLATE_MISSING",
          detail: `The template needs "${key}", which this message does not provide.`,
        };
      }
      parameters.push(value);
    }
    return this.deps.transport.deliver({
      phoneNumberId,
      templateName: template.providerName,
      language: template.language,
      category: template.category,
      to,
      parameters,
    });
  }
}

function notConfigured(): WhatsAppSendResult {
  return {
    ok: false,
    code: "NOT_CONFIGURED",
    detail: WHATSAPP_NOT_CONFIGURED_DETAIL,
  };
}
