"use client";

import { useActionState, useEffect, useState } from "react";

import {
  ErrorSummary,
  FieldShell,
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
import { control, form } from "@/presentation/admin/ui/classes";

export type TestTemplateOption = Readonly<{ id: string; label: string }>;

type TestMessageFormProps = Readonly<{
  action: FormAction;
  templates: readonly TestTemplateOption[];
}>;

export function WhatsAppTestMessageForm({
  action,
  templates,
}: TestMessageFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  // The Admin's own number stays in the browser only; the server never echoes
  // it. A controlled input keeps its text through React's form reset.
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  const summary =
    state.status === "error"
      ? Object.entries(state.fieldErrors ?? {}).flatMap(([name, messages]) =>
          messages.map((message) => ({
            fieldId:
              name === "templateId" ? "wa-test-template" : "wa-test-phone",
            message,
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
        id="wa-test-phone"
        name="phone"
        label="Send to"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        hint="Your own number, in international format. It is not stored."
        maxLength={32}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        errors={fieldErrorsFor(state, "phone")}
      />
      <FieldShell
        id="wa-test-template"
        label="Template"
        optional
        errors={fieldErrorsFor(state, "templateId")}
        hint="Leave on the default to use the active English test template."
      >
        {(describedBy, invalid) => (
          <select
            // Remounted per result so the restored choice is applied after
            // React's form reset (a select ignores a changed defaultValue).
            key={`${state.status}:${state.status === "error" ? (state.values?.templateId ?? "") : ""}`}
            id="wa-test-template"
            name="templateId"
            className={control}
            defaultValue={
              state.status === "error" ? (state.values?.templateId ?? "") : ""
            }
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          >
            <option value="">Default test template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        )}
      </FieldShell>
      <FormActions
        meta="Up to 5 test messages every 10 minutes."
        primary={
          <SubmitButton pendingLabel="Sending…">Send test message</SubmitButton>
        }
      />
    </form>
  );
}
