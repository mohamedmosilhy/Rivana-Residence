"use client";

import { useActionState, useEffect, useState } from "react";

import { PromotionCard } from "@/presentation/features/promotions/promotion-card";
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
import { useUnsavedChanges } from "@/presentation/admin/ui/use-unsaved-changes";
import {
  check,
  checkInput,
  fieldset,
  fieldsetHint,
  formGrid,
  legend,
  muted,
  sectionTitle,
} from "@/presentation/admin/ui/classes";

export type PromotionFormValues = Readonly<{
  internalName: string;
  headline: string;
  body: string;
  code: string;
  terms: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  showAsPopup: boolean;
}>;

const LABELS: Record<string, string> = {
  internalName: "Internal name",
  headline: "Headline",
  body: "Message",
  code: "Code",
  terms: "Terms",
  startsAt: "Starts",
  endsAt: "Ends",
  priority: "Priority",
};

type PromotionFormProps = Readonly<{
  action: FormAction;
  values: PromotionFormValues;
  timeZone: string;
  submitLabel: string;
  meta?: string;
}>;

export function PromotionForm({
  action,
  values,
  timeZone,
  submitLabel,
  meta,
}: PromotionFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const { markDirty, markSaved } = useUnsavedChanges();
  // The public fields are controlled so the preview updates as staff type.
  const [copy, setCopy] = useState({
    headline: values.headline,
    body: values.body,
    code: values.code,
    terms: values.terms,
  });

  useEffect(() => {
    if (state.status === "success") {
      markSaved();
      toast(state.message);
    }
  }, [state, toast, markSaved]);

  const valueOf = (field: keyof PromotionFormValues) => {
    if (state.status === "error" && state.values) {
      return state.values[field] ?? "";
    }
    const value = values[field];
    return typeof value === "string" ? value : "";
  };
  const errors = (field: string) => fieldErrorsFor(state, field);
  const zoneLabel = `${timeZone} time`;

  const summary =
    state.status === "error"
      ? Object.entries(state.fieldErrors ?? {}).flatMap(([field, messages]) =>
          messages.map((message) => ({
            fieldId: `promotion-${field === "promotion" ? "headline" : field}`,
            message: `${LABELS[field] ?? "Promotion"}: ${message}`,
          })),
        )
      : [];

  const copyField = (
    field: keyof typeof copy,
    label: string,
    options: Readonly<{
      multiline?: boolean;
      maxLength: number;
      hint?: string;
      optional?: boolean;
    }>,
  ) => {
    const props = {
      id: `promotion-${field}`,
      name: field,
      label,
      hint: options.hint,
      optional: options.optional,
      maxLength: options.maxLength,
      value: copy[field],
      errors: errors(field),
    };
    return options.multiline ? (
      <TextAreaField
        {...props}
        onChange={(event) => setCopy({ ...copy, [field]: event.target.value })}
      />
    ) : (
      <TextField
        {...props}
        spellCheck={field === "code" ? false : undefined}
        autoComplete="off"
        onChange={(event) => setCopy({ ...copy, [field]: event.target.value })}
      />
    );
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] items-start gap-8 max-lg:grid-cols-[minmax(0,1fr)]">
      <form
        className="mt-0 grid gap-5 rounded-panel border border-neutral-300 bg-surface p-[clamp(1.25rem,3vw,2rem)]"
        action={formAction}
        onInput={markDirty}
        noValidate
      >
        {state.status === "error" ? (
          <ErrorSummary
            title={state.message}
            errors={summary}
            submission={state}
          />
        ) : null}

        <fieldset className={fieldset}>
          <legend className={legend}>For staff</legend>
          <TextField
            id="promotion-internalName"
            name="internalName"
            label="Internal name"
            hint="Only staff see this, e.g. “Autumn 2026 long stays”."
            maxLength={120}
            defaultValue={valueOf("internalName")}
            errors={errors("internalName")}
            autoComplete="off"
          />
        </fieldset>

        <fieldset className={fieldset}>
          <legend className={legend}>Pop-up content</legend>
          {copyField("headline", "Headline", { maxLength: 160 })}
          {copyField("body", "Message", {
            multiline: true,
            maxLength: 600,
            hint: "Plain text, up to 600 characters.",
          })}
          {copyField("code", "Code", {
            maxLength: 32,
            hint: "Letters, numbers, hyphens, or underscores. Visitors copy this into the reservation system.",
          })}
          {copyField("terms", "Terms", {
            multiline: true,
            maxLength: 1200,
            optional: true,
            hint: "A short plain-text summary.",
          })}
        </fieldset>

        <fieldset className={fieldset}>
          <legend className={legend}>Schedule</legend>
          <p className={fieldsetHint}>
            Times are in the property’s time zone ({timeZone}). Leave blank to
            start immediately or to run with no end date.
          </p>
          <div className={formGrid}>
            <TextField
              id="promotion-startsAt"
              name="startsAt"
              type="datetime-local"
              label={`Starts (${zoneLabel})`}
              optional
              defaultValue={valueOf("startsAt")}
              errors={errors("startsAt")}
            />
            <TextField
              id="promotion-endsAt"
              name="endsAt"
              type="datetime-local"
              label={`Ends (${zoneLabel})`}
              optional
              defaultValue={valueOf("endsAt")}
              errors={errors("endsAt")}
            />
          </div>
        </fieldset>

        <fieldset className={fieldset}>
          <legend className={legend}>Display</legend>
          <label className={check}>
            <input
              type="checkbox"
              className={checkInput}
              name="showAsPopup"
              defaultChecked={
                state.status === "error" && state.values
                  ? state.values.showAsPopup === "on"
                  : values.showAsPopup
              }
            />
            Show as a pop-up on the website
          </label>
          <TextField
            id="promotion-priority"
            name="priority"
            label="Priority"
            inputMode="numeric"
            hint="When several promotions are live, the highest priority shows. Ties go to the most recently published."
            defaultValue={valueOf("priority")}
            errors={errors("priority")}
          />
        </fieldset>

        <FormActions
          meta={meta}
          primary={
            <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
          }
        />
      </form>

      <aside
        className="sticky top-20 max-lg:static"
        aria-labelledby="promotion-preview-title"
      >
        <h2 id="promotion-preview-title" className={sectionTitle}>
          Preview
        </h2>
        <p className={muted}>Updates as you type. This is what visitors see.</p>
        <div className="mt-3 rounded-panel bg-[rgb(31_27_29/0.55)] p-4">
          <PromotionCard
            headline={copy.headline}
            body={copy.body}
            code={copy.code}
            terms={copy.terms.trim() || null}
          />
        </div>
      </aside>
    </div>
  );
}
