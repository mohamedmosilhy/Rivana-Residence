"use server";

import { saveVerificationSettings } from "@/composition/admin-verification";
import type { FormState } from "@/presentation/admin/ui/form-state";

import { actionResult, typedValues } from "../../action-results";

const PATH = "/admin/settings/verification";

export async function saveVerificationSettingsAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await saveVerificationSettings({
    emailVerificationEnabled: formData.get("emailVerificationEnabled") === "on",
  });
  return actionResult(
    result,
    PATH,
    "Verification settings saved.",
    typedValues(formData),
  );
}
