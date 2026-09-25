import type { ApplicationError } from "@/application/shared/result";

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export type FormState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "success"; message: string }>
  | Readonly<{
      status: "error";
      message: string;
      fieldErrors?: FieldErrors;
      /** Non-secret values to restore after React resets the form. */
      values?: Readonly<Record<string, string>>;
    }>;

export type FormAction = (
  state: FormState,
  formData: FormData,
) => Promise<FormState>;

export const idleFormState: FormState = { status: "idle" };

export function fieldErrorsFor(state: FormState, field: string) {
  return state.status === "error" ? (state.fieldErrors?.[field] ?? []) : [];
}

export function errorState(
  error: ApplicationError,
  values?: Readonly<Record<string, string>>,
): FormState {
  return {
    status: "error",
    message: error.message,
    ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    ...(values ? { values } : {}),
  };
}
