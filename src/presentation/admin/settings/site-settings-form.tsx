"use client";

import { useActionState, useEffect } from "react";

import {
  ErrorSummary,
  FormActions,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/presentation/admin/ui/form";
import type {
  SiteSettingsField,
  SiteSettingsValues,
} from "@/presentation/admin/settings/fields";
import {
  fieldErrorsFor,
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";
import {
  fieldset,
  fieldsetHint,
  form,
  legend,
} from "@/presentation/admin/ui/classes";

const LABELS: Record<SiteSettingsField, string> = {
  siteName: "Residence name",
  tagline: "Tagline",
  footerText: "Footer text",
  defaultSeoTitle: "Default page title",
  defaultSeoDescription: "Default description",
};

const fieldId = (name: string) => `settings-${name}`;

type SiteSettingsFormProps = Readonly<{
  action: FormAction;
  values: SiteSettingsValues;
  version: string;
  lastSaved: string;
}>;

export function SiteSettingsForm({
  action,
  values,
  version,
  lastSaved,
}: SiteSettingsFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  // After a failed save React resets the form, so restore what was typed.
  const valueOf = (name: SiteSettingsField) =>
    state.status === "error" && state.values
      ? (state.values[name] ?? "")
      : values[name];

  const field = (
    name: SiteSettingsField,
    props: Readonly<{
      hint?: string;
      optional?: boolean;
      type?: string;
      inputMode?: "decimal" | "tel" | "email" | "url";
      autoComplete?: string;
      maxLength?: number;
    }> = {},
  ) => (
    <TextField
      key={name}
      id={fieldId(name)}
      name={name}
      label={LABELS[name]}
      defaultValue={valueOf(name)}
      errors={fieldErrorsFor(state, name)}
      optional={props.optional ?? true}
      hint={props.hint}
      type={props.type}
      inputMode={props.inputMode}
      autoComplete={props.autoComplete ?? "off"}
      maxLength={props.maxLength}
      spellCheck={
        props.type === "email" || props.type === "url" ? false : undefined
      }
    />
  );

  const summary =
    state.status === "error"
      ? Object.entries(state.fieldErrors ?? {}).flatMap(([name, messages]) =>
          messages.map((message) => ({
            fieldId: fieldId(name),
            message: `${LABELS[name as SiteSettingsField] ?? name}: ${message}`,
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
      <input type="hidden" name="expectedUpdatedAt" value={version} />

      <fieldset className={fieldset}>
        <legend className={legend}>Identity</legend>
        {field("siteName", { optional: false, maxLength: 120 })}
        {field("tagline", {
          hint: "A short line that can appear beside the name.",
          maxLength: 240,
        })}
      </fieldset>

      <p className={fieldsetHint} data-settings-branch-note="">
        Contact details, address, and map are set on each branch.
      </p>

      <fieldset className={fieldset}>
        <legend className={legend}>Footer</legend>
        <TextAreaField
          id={fieldId("footerText")}
          name="footerText"
          label={LABELS.footerText}
          optional
          hint="Plain text shown at the bottom of every page. Up to 500 characters."
          maxLength={500}
          defaultValue={valueOf("footerText")}
          errors={fieldErrorsFor(state, "footerText")}
        />
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Default search appearance</legend>
        <p className={fieldsetHint}>
          Used for any page that does not set its own title or description.
        </p>
        {field("defaultSeoTitle", {
          hint: "Up to 70 characters.",
          maxLength: 70,
        })}
        <TextAreaField
          id={fieldId("defaultSeoDescription")}
          name="defaultSeoDescription"
          label={LABELS.defaultSeoDescription}
          optional
          hint="Up to 170 characters."
          maxLength={170}
          defaultValue={valueOf("defaultSeoDescription")}
          errors={fieldErrorsFor(state, "defaultSeoDescription")}
        />
      </fieldset>

      <FormActions
        meta={lastSaved}
        primary={
          <SubmitButton pendingLabel="Saving…">Save site details</SubmitButton>
        }
      />
    </form>
  );
}
