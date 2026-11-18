"use client";

import { useActionState, useEffect } from "react";

import {
  ErrorSummary,
  FormActions,
  SubmitButton,
  TextField,
} from "@/presentation/admin/ui/form";
import {
  fieldErrorsFor,
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";
import { form } from "@/presentation/admin/ui/classes";

const LABELS = {
  businessPhoneNumber: "Business WhatsApp number",
  providerPhoneNumberId: "Phone number id",
} as const;
type Field = keyof typeof LABELS;

const fieldId = (name: string) => `wa-setup-${name}`;

type SetupFormProps = Readonly<{
  action: FormAction;
  values: Readonly<Record<Field, string>>;
}>;

export function WhatsAppSetupForm({ action, values }: SetupFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  // After a failed save React resets the form, so restore what was typed.
  const valueOf = (name: Field) =>
    state.status === "error" && state.values
      ? (state.values[name] ?? "")
      : values[name];

  const summary =
    state.status === "error"
      ? Object.entries(state.fieldErrors ?? {}).flatMap(([name, messages]) =>
          messages.map((message) => ({
            fieldId:
              name in LABELS ? fieldId(name) : fieldId("businessPhoneNumber"),
            message: `${LABELS[name as Field] ?? "WhatsApp setup"}: ${message}`,
          })),
        )
      : [];

  return (
    <form className={form} action={formAction} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={summary}
          submission={state}
        />
      ) : null}
      <TextField
        id={fieldId("businessPhoneNumber")}
        name="businessPhoneNumber"
        label={LABELS.businessPhoneNumber}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        optional
        hint="International format, for example +201001234567. Leave it empty until the number is supplied; sending stays off while it is empty."
        maxLength={32}
        defaultValue={valueOf("businessPhoneNumber")}
        errors={fieldErrorsFor(state, "businessPhoneNumber")}
      />
      <TextField
        id={fieldId("providerPhoneNumberId")}
        name="providerPhoneNumberId"
        label={LABELS.providerPhoneNumberId}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        optional
        hint="The number id shown in Meta's WhatsApp Business dashboard (digits only)."
        maxLength={64}
        defaultValue={valueOf("providerPhoneNumberId")}
        errors={fieldErrorsFor(state, "providerPhoneNumberId")}
      />
      <FormActions
        primary={<SubmitButton pendingLabel="Saving…">Save setup</SubmitButton>}
      />
    </form>
  );
}
