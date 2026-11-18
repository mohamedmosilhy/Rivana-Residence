import type {
  WhatsAppSetupView,
  WhatsAppTemplateRecord,
  WhatsAppTestResult,
} from "@/application/notifications";
import type {
  WhatsAppSetup,
  WhatsAppTemplate,
  WhatsAppTemplateList,
  WhatsAppTestMessageResult,
} from "@/contracts/api/v1/whatsapp";
import type { z } from "zod";

/** API-A6 `GET`. Built field by field, so no token could ever be added. */
export function whatsAppSetup(
  view: WhatsAppSetupView,
): z.infer<typeof WhatsAppSetup> {
  return {
    businessPhoneNumber: view.businessPhoneNumber,
    providerPhoneNumberId: view.providerPhoneNumberId,
    accessTokenConfigured: view.accessTokenConfigured,
    configured: view.configured,
    setupGaps: view.setupGaps.map((gap) => ({
      purpose: gap.purpose,
      language: gap.language,
      blocking: gap.blocking,
    })),
    lastTest:
      view.lastTestAt === null
        ? null
        : {
            at: view.lastTestAt.toISOString(),
            ok: view.lastTestOk === true,
            error: view.lastTestError,
          },
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function whatsAppTemplate(
  record: WhatsAppTemplateRecord,
): z.infer<typeof WhatsAppTemplate> {
  return {
    id: record.id,
    purpose: record.purpose,
    language: record.language,
    providerName: record.providerName,
    category: record.category,
    variables: [...record.variables],
    previewText: record.previewText,
    active: record.active,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const whatsAppTemplateList = (
  records: readonly WhatsAppTemplateRecord[],
): z.infer<typeof WhatsAppTemplateList> => ({
  items: records.map(whatsAppTemplate),
});

export const whatsAppTestResult = (
  result: WhatsAppTestResult,
): z.infer<typeof WhatsAppTestMessageResult> => ({
  ok: true,
  providerMessageId: result.providerMessageId,
});
