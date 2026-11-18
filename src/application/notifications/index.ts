// Public surface of the notifications application module (D-8).
export {
  ManageWhatsAppSettings,
  type WhatsAppSettingsContext,
} from "./manage-whatsapp-settings";
export {
  ACTIVE_TEMPLATE_TAKEN,
  ManageWhatsAppTemplates,
  type WhatsAppTemplateContext,
} from "./manage-whatsapp-templates";
export {
  SendWhatsAppTestMessage,
  type WhatsAppTestContext,
  type WhatsAppTestResult,
} from "./send-whatsapp-test-message";
export {
  TemplateWhatsAppSender,
  WHATSAPP_NOT_CONFIGURED_DETAIL,
  WHATSAPP_TEMPLATE_MISSING_DETAIL,
  type TemplateWhatsAppSenderDeps,
} from "./template-whatsapp-sender";
export {
  WhatsAppSetupReader,
  type WhatsAppSetupReaderDeps,
  type WhatsAppSetupView,
} from "./whatsapp-setup";
export type {
  StaffActionLimiter,
  WhatsAppDelivery,
  WhatsAppFailureCode,
  WhatsAppMessage,
  WhatsAppSender,
  WhatsAppSendResult,
  WhatsAppSettingsRecord,
  WhatsAppSettingsRepository,
  WhatsAppSettingsWrite,
  WhatsAppSettingsWriteOutcome,
  WhatsAppTemplateRecord,
  WhatsAppTemplateRepository,
  WhatsAppTestOutcome,
  WhatsAppTransport,
  WhatsAppTransportResult,
} from "./ports";
