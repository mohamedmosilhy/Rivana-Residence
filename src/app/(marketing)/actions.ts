"use server";

import { formDataValues } from "@/application/content/form-values";
import { submitEnquiry } from "@/composition/public";
import { errorState, type FormState } from "@/presentation/admin/ui/form-state";

const KEEP = ["name", "email", "phone", "subject", "message"] as const;

export async function submitEnquiryAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formDataValues(formData);
  const result = await submitEnquiry(values);
  if (result.ok) {
    return {
      status: "success",
      message:
        "Your message has been sent. The Rivana Residence team will reply by email as soon as possible.",
    };
  }
  // Keep what the visitor typed (never the hidden fields).
  const typed = Object.fromEntries(
    KEEP.map((name) => [
      name,
      typeof values[name] === "string" ? (values[name] as string) : "",
    ]),
  );
  return errorState(result.error, typed);
}
