"use server";

import { formDataValues } from "@/application/content/form-values";
import { submitEnquiry } from "@/composition/public";
import { errorState, type FormState } from "@/presentation/admin/ui/form-state";

const KEEP = ["name", "email", "phone", "subject", "message"] as const;

const UNAVAILABLE =
  "We could not send your message just now. It is still below, so you can try again in a few minutes, or call or email us instead.";

export async function submitEnquiryAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formDataValues(formData);
  // Keep what the visitor typed (never the hidden fields).
  const typed = Object.fromEntries(
    KEEP.map((name) => [
      name,
      typeof values[name] === "string" ? (values[name] as string) : "",
    ]),
  );

  let result: Awaited<ReturnType<typeof submitEnquiry>>;
  try {
    result = await submitEnquiry(values);
  } catch (error) {
    // An outage (database, filesystem) must not replace the form with an
    // error page and discard the message. Log only the error class and code:
    // driver messages can echo the visitor's details.
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "none";
    console.error(
      `[enquiry] submission failed: ${error instanceof Error ? error.name : typeof error} (code ${code})`,
    );
    return { status: "error", message: UNAVAILABLE, values: typed };
  }

  if (result.ok) {
    return {
      status: "success",
      message:
        "Your message has been sent. The Rivana Residence team will reply by email as soon as possible.",
    };
  }
  return errorState(result.error, typed);
}
