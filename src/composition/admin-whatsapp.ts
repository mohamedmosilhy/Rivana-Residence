import "server-only";

import { getCurrentStaff } from "@/composition/auth";
import {
  manageWhatsAppSettings,
  manageWhatsAppTemplates,
  sendWhatsAppTestMessage,
} from "@/composition/notifications";

// The Admin WhatsApp screen (M8-T4b). Each function resolves the signed-in
// staff member and calls one use case; the use case runs `authorize`.

export async function readWhatsAppSetup() {
  return manageWhatsAppSettings().read(await getCurrentStaff());
}

export async function listWhatsAppTemplates() {
  return manageWhatsAppTemplates().list(await getCurrentStaff());
}

export async function saveWhatsAppSettings(input: unknown) {
  return manageWhatsAppSettings().update(await getCurrentStaff(), input);
}

/** Creates a template, or patches the one with `id`. */
export async function saveWhatsAppTemplate(id: string | null, input: unknown) {
  const templates = manageWhatsAppTemplates();
  const staff = await getCurrentStaff();
  return id
    ? templates.update(staff, id, input)
    : templates.create(staff, input);
}

export async function sendWhatsAppTest(input: unknown) {
  return sendWhatsAppTestMessage().execute(await getCurrentStaff(), input);
}
