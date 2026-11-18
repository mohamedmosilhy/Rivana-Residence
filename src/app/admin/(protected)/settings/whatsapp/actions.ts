"use server";

import {
  saveWhatsAppSettings,
  saveWhatsAppTemplate,
  sendWhatsAppTest,
} from "@/composition/admin-whatsapp";
import { typedValues, actionResult } from "../../action-results";
import type { FormState } from "@/presentation/admin/ui/form-state";

const PATH = "/admin/settings/whatsapp";

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function saveWhatsAppSettingsAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await saveWhatsAppSettings({
    businessPhoneNumber: text(formData, "businessPhoneNumber"),
    providerPhoneNumberId: text(formData, "providerPhoneNumberId"),
  });
  return actionResult(
    result,
    PATH,
    "WhatsApp setup saved.",
    typedValues(formData),
  );
}

/** Creates a template, or patches one when the form carries its id. */
export async function saveWhatsAppTemplateAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "id") || null;
  const result = await saveWhatsAppTemplate(id, {
    purpose: text(formData, "purpose"),
    language: text(formData, "language"),
    providerName: text(formData, "providerName"),
    category: text(formData, "category"),
    variables: formData
      .getAll("variables")
      .filter((value): value is string => typeof value === "string"),
    previewText: text(formData, "previewText"),
    active: formData.get("active") === "on",
  });
  return actionResult(
    result,
    PATH,
    id ? "Template saved." : "Template added.",
    typedValues(formData),
  );
}

export async function sendWhatsAppTestAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const templateId = text(formData, "templateId");
  const result = await sendWhatsAppTest({
    phone: text(formData, "phone"),
    templateId: templateId || null,
  });
  // The phone is never part of the restored values: it stays in the browser.
  return actionResult(
    result,
    PATH,
    result.ok
      ? `Test message accepted by WhatsApp (message id ${result.value.providerMessageId}). Check the phone.`
      : "",
    { templateId },
  );
}
