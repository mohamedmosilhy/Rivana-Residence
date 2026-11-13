"use client";

import { useActionState, useEffect, useState } from "react";

import type { MediaOption } from "@/application/media/ports";
import { SingleImage } from "@/presentation/admin/media/image-choice";
import {
  ErrorSummary,
  FieldShell,
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
import type {
  BranchFormField,
  BranchFormValues,
} from "@/presentation/admin/branches/fields";
import {
  control,
  fieldset,
  fieldsetHint,
  form,
  formGrid,
  legend,
} from "@/presentation/admin/ui/classes";

const LABELS: Record<BranchFormField | "heroMediaId", string> = {
  name: "Name",
  slug: "Web address",
  summary: "Summary",
  status: "Status",
  phone: "Phone",
  email: "Email",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  country: "Country",
  latitude: "Latitude",
  longitude: "Longitude",
  checkInTime: "Check-in time",
  checkOutTime: "Check-out time",
  mapEmbedUrl: "Google Maps embed link",
  sortOrder: "Display order",
  heroMediaId: "Branch image",
};

const id = (field: string) => `branch-${field}`;

/**
 * The minimal branch form (spec 0002; the full branch admin is M12). The
 * web address is set once, on creation. Online booking stays off until its
 * prerequisites exist (M10).
 */
export function BranchForm({
  action,
  values,
  isNew,
  isDefault = false,
  options,
  submitLabel,
  meta,
}: Readonly<{
  action: FormAction;
  values: BranchFormValues;
  isNew: boolean;
  /** The branch the old website addresses redirect to. */
  isDefault?: boolean;
  options: readonly MediaOption[];
  submitLabel: string;
  meta?: string;
}>) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const { markDirty, markSaved } = useUnsavedChanges();
  const [hero, setHero] = useState(values.heroMediaId);

  useEffect(() => {
    if (state.status === "success") {
      markSaved();
      toast(state.message);
    }
  }, [state, toast, markSaved]);

  const valueOf = (field: BranchFormField) =>
    state.status === "error" && state.values
      ? (state.values[field] ?? "")
      : values[field];
  const errors = (field: string) => fieldErrorsFor(state, field);
  const text = (
    field: BranchFormField,
    extra: Readonly<{
      hint?: string;
      optional?: boolean;
      maxLength?: number;
      type?: string;
      inputMode?: "text" | "email" | "tel" | "url" | "decimal" | "numeric";
    }> = {},
  ) => (
    <TextField
      id={id(field)}
      name={field}
      label={LABELS[field]}
      defaultValue={valueOf(field)}
      errors={errors(field)}
      optional={extra.optional ?? true}
      {...(extra.hint ? { hint: extra.hint } : {})}
      {...(extra.maxLength ? { maxLength: extra.maxLength } : {})}
      {...(extra.type ? { type: extra.type } : {})}
      {...(extra.inputMode ? { inputMode: extra.inputMode } : {})}
    />
  );

  return (
    <form className={form} action={formAction} onInput={markDirty} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={Object.entries(state.fieldErrors ?? {}).flatMap(
            ([field, messages]) =>
              messages.map((message) => ({
                fieldId: id(field),
                message: `${LABELS[field as BranchFormField] ?? field}: ${message}`,
              })),
          )}
          submission={state}
        />
      ) : null}

      <fieldset className={fieldset}>
        <legend className={legend}>Branch</legend>
        {text("name", { optional: false, maxLength: 120 })}
        {isNew ? (
          text("slug", {
            optional: false,
            maxLength: 80,
            hint: "Lowercase words joined by hyphens, e.g. new-cairo. The branch website lives at /{web address}. It cannot change later.",
          })
        ) : (
          <TextField
            id={id("slug")}
            label={LABELS.slug}
            hint="Fixed once created."
            value={`/${values.slug}`}
            readOnly
          />
        )}
        <TextAreaField
          id={id("summary")}
          name="summary"
          label={LABELS.summary}
          optional
          hint="One or two sentences for the branch chooser. Up to 300 characters."
          maxLength={300}
          defaultValue={valueOf("summary")}
          errors={errors("summary")}
        />
        <FieldShell
          id={id("status")}
          label={LABELS.status}
          hint={
            isDefault
              ? "This branch receives the old website addresses, so it stays active."
              : "An inactive branch disappears from the website: its pages return “not found”. With no active branch the website shows a holding page."
          }
          errors={errors("status")}
        >
          {(describedBy, invalid) => (
            <select
              id={id("status")}
              name="status"
              className={control}
              defaultValue={valueOf("status") || "ACTIVE"}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          )}
        </FieldShell>
        {text("sortOrder", {
          optional: false,
          inputMode: "numeric",
          hint: "Lower numbers come first in the chooser and switcher.",
        })}
        <TextField
          id={id("onlineBookingEnabled")}
          label="Online booking"
          hint="Turned on in a later release, once WhatsApp messaging is set up."
          value="Off"
          readOnly
        />
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Contact and location</legend>
        <p className={fieldsetHint}>
          Shown on this branch’s pages: the footer, the Contact page, and the
          map.
        </p>
        <div className={formGrid}>
          {text("phone", {
            type: "tel",
            inputMode: "tel",
            hint: "Include the country code, for example +20 2 1234 5678.",
          })}
          {text("email", { type: "email", inputMode: "email" })}
        </div>
        {text("addressLine1", { maxLength: 180 })}
        {text("addressLine2", { maxLength: 180 })}
        <div className={formGrid}>
          {text("city", { maxLength: 100 })}
          {text("country", { maxLength: 100 })}
        </div>
        <div className={formGrid}>
          {text("latitude", {
            inputMode: "decimal",
            hint: "Between -90 and 90, for example 30.0131.",
          })}
          {text("longitude", {
            inputMode: "decimal",
            hint: "Between -180 and 180, for example 31.4913.",
          })}
        </div>
        {text("mapEmbedUrl", {
          type: "url",
          inputMode: "url",
          hint: 'In Google Maps choose Share → Embed a map, then paste only the link inside src="…". It must start with https://www.google.com/maps/embed.',
        })}
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Stay times</legend>
        <div className={formGrid}>
          {text("checkInTime", { hint: "HH:MM, for example 14:00." })}
          {text("checkOutTime", { hint: "HH:MM, for example 12:00." })}
        </div>
      </fieldset>

      <input type="hidden" name="heroMediaId" value={hero ?? ""} />
      <SingleImage
        label={LABELS.heroMediaId}
        hint="Shown on this branch’s card in the chooser."
        options={options}
        value={hero ? { mediaId: hero, altOverride: null } : null}
        onChange={(value) => {
          setHero(value?.mediaId ?? null);
          markDirty();
        }}
      />
      {errors("heroMediaId").length > 0 ? (
        <p className="m-0 text-danger" id={id("heroMediaId")}>
          {errors("heroMediaId").join(" ")}
        </p>
      ) : null}

      <FormActions
        meta={meta}
        primary={
          <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        }
      />
    </form>
  );
}
