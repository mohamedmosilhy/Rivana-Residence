import "server-only";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathFor } from "@/application/auth/return-path";
import type { Result } from "@/application/shared/result";
import { errorState, type FormState } from "@/presentation/admin/ui/form-state";

/** Non-file form values, used to restore what was typed after a failure. */
export function typedValues(formData: FormData) {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/**
 * Turns a command result into form state. A lost session goes to login and
 * comes back to `path`; success refreshes `path` so the page shows the
 * change.
 */
export function actionResult(
  result: Result<unknown>,
  path: string,
  successMessage: string,
  values?: Readonly<Record<string, string>>,
): FormState {
  if (!result.ok) {
    if (result.error.code === "UNAUTHENTICATED") {
      redirect(loginPathFor(path) as Route);
    }
    return errorState(result.error, values);
  }
  revalidatePath(path);
  return { status: "success", message: successMessage };
}
