export type FormState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "success"; message: string }>
  | Readonly<{
      status: "error";
      message: string;
      fieldErrors?: Readonly<Record<string, readonly string[]>>;
      /** Non-secret values to restore after React resets the form. */
      values?: Readonly<Record<string, string>>;
    }>;

export type FormAction = (
  state: FormState,
  formData: FormData,
) => Promise<FormState>;

export const idleFormState: FormState = { status: "idle" };
