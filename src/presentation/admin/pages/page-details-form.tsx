"use client";

import { useActionState, useEffect } from "react";

import {
  ErrorSummary,
  FormActions,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/presentation/admin/ui/form";
import {
  fieldErrorsFor,
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";

export function PageDetailsForm({
  action,
  seoTitle,
  seoDescription,
}: Readonly<{
  action: FormAction;
  seoTitle: string;
  seoDescription: string;
}>) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  const valueOf = (field: "seoTitle" | "seoDescription", fallback: string) =>
    state.status === "error" && state.values
      ? (state.values[field] ?? "")
      : fallback;

  return (
    <form className="admin-form" action={formAction} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={Object.entries(state.fieldErrors ?? {}).flatMap(
            ([field, messages]) =>
              messages.map((message) => ({
                fieldId: `page-${field}`,
                message,
              })),
          )}
          submission={state}
        />
      ) : null}
      <TextField
        id="page-seoTitle"
        name="seoTitle"
        label="Search title"
        optional
        hint="Up to 70 characters. Leave blank to use the site default."
        maxLength={70}
        defaultValue={valueOf("seoTitle", seoTitle)}
        errors={fieldErrorsFor(state, "seoTitle")}
      />
      <TextAreaField
        id="page-seoDescription"
        name="seoDescription"
        label="Search description"
        optional
        hint="Up to 170 characters."
        maxLength={170}
        defaultValue={valueOf("seoDescription", seoDescription)}
        errors={fieldErrorsFor(state, "seoDescription")}
      />
      <FormActions
        primary={
          <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
        }
      />
    </form>
  );
}
