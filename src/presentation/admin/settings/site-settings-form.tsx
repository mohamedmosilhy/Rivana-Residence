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

const LABELS: Record<SiteSettingsField, string> = {
  siteName: "Residence name",
  tagline: "Tagline",
  phone: "Phone",
  email: "Email",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  country: "Country",
  latitude: "Latitude",
  longitude: "Longitude",
  mapEmbedUrl: "Google Maps embed link",
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
    <form className="admin-form" action={formAction} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={summary}
          submission={state}
        />
      ) : null}
      <input type="hidden" name="expectedUpdatedAt" value={version} />

      <fieldset className="admin-fieldset">
        <legend>Identity</legend>
        {field("siteName", { optional: false, maxLength: 120 })}
        {field("tagline", {
          hint: "A short line that can appear beside the name.",
          maxLength: 240,
        })}
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Contact and location</legend>
        <div className="admin-form-grid">
          {field("phone", {
            type: "tel",
            inputMode: "tel",
            hint: "Include the country code, for example +20 2 1234 5678.",
          })}
          {field("email", { type: "email", inputMode: "email" })}
        </div>
        {field("addressLine1", { maxLength: 180 })}
        {field("addressLine2", { maxLength: 180 })}
        <div className="admin-form-grid">
          {field("city", { maxLength: 100 })}
          {field("country", { maxLength: 100 })}
        </div>
        <div className="admin-form-grid">
          {field("latitude", {
            inputMode: "decimal",
            hint: "Between -90 and 90, for example 30.0131.",
          })}
          {field("longitude", {
            inputMode: "decimal",
            hint: "Between -180 and 180, for example 31.4913.",
          })}
        </div>
        {field("mapEmbedUrl", {
          type: "url",
          inputMode: "url",
          hint: 'In Google Maps choose Share → Embed a map, then paste only the link inside src="…". It must start with https://www.google.com/maps/embed.',
        })}
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Footer</legend>
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

      <fieldset className="admin-fieldset">
        <legend>Default search appearance</legend>
        <p className="admin-fieldset__hint">
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
