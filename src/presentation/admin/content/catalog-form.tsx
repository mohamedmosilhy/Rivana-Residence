"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { MAX_ROOM_FEATURES } from "@/domain/rooms/room";
import { slugify } from "@/domain/shared/slug";
import {
  ErrorSummary,
  FormActions,
  SubmitButton,
  TextAreaField,
  TextField,
  type SummaryError,
} from "@/presentation/admin/ui/form";
import {
  fieldErrorsFor,
  idleFormState,
  type FormAction,
  type FormState,
} from "@/presentation/admin/ui/form-state";
import { RepeatableFields } from "@/presentation/admin/ui/repeatable-fields";
import { useToast } from "@/presentation/admin/ui/toast";
import { useUnsavedChanges } from "@/presentation/admin/ui/use-unsaved-changes";

export type CatalogFormValues = Readonly<{
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  // Rooms
  sizeSqm?: string;
  maxAdults?: string;
  maxChildren?: string;
  bedSummary?: string;
  viewSummary?: string;
  features?: readonly string[];
  // Facilities
  openingHoursText?: string;
}>;

const LABELS: Record<string, string> = {
  name: "Name",
  slug: "Web address",
  shortDescription: "Short description",
  description: "Description",
  sizeSqm: "Size",
  maxAdults: "Adults",
  maxChildren: "Children",
  bedSummary: "Beds",
  viewSummary: "View",
  features: "Features",
  openingHoursText: "Opening hours",
  seoTitle: "Search title",
  seoDescription: "Search description",
};

export const DESCRIPTION_HINT =
  "Separate paragraphs with a blank line. Start a line with “## ” for a heading, “- ” for a bullet, or “1. ” for a numbered item.";

/** Maps server field paths (e.g. "features.2.label") to element ids. */
function summaryFor(state: FormState, variant: "room" | "facility") {
  if (state.status !== "error") return [];
  return Object.entries(state.fieldErrors ?? {}).flatMap(
    ([path, messages]): SummaryError[] => {
      const [field, index] = path.split(".");
      const root = field ?? path;
      const fieldId =
        root === "features" && index !== undefined
          ? `features-${index}-label`
          : root === "description"
            ? `${variant}-description`
            : `${variant}-${root}`;
      const label =
        root === "features" && index !== undefined
          ? `Feature ${Number(index) + 1}`
          : (LABELS[root] ?? root);
      return messages.map((message) => ({
        fieldId,
        message: `${label}: ${message}`,
      }));
    },
  );
}

type CatalogFormProps = Readonly<{
  variant: "room" | "facility";
  action: FormAction;
  values: CatalogFormValues;
  /** True on the create page: the slug follows the name until edited. */
  isNew: boolean;
  submitLabel: string;
  meta?: string;
}>;

export function CatalogForm({
  variant,
  action,
  values,
  isNew,
  submitLabel,
  meta,
}: CatalogFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const { markDirty, markSaved } = useUnsavedChanges();
  const [name, setName] = useState(values.name);
  const [slug, setSlug] = useState(values.slug);
  const slugEdited = useRef(!isNew);
  const id = (field: string) => `${variant}-${field}`;

  useEffect(() => {
    if (state.status === "success") {
      markSaved();
      toast(state.message);
    }
  }, [state, toast, markSaved]);

  // After a failed save React resets uncontrolled fields; restore input.
  const valueOf = (field: keyof CatalogFormValues) => {
    if (state.status === "error" && state.values) {
      return state.values[field] ?? "";
    }
    const value = values[field];
    return typeof value === "string" ? value : "";
  };
  const errors = (field: string) => fieldErrorsFor(state, field);

  return (
    <form
      className="admin-form"
      action={formAction}
      onInput={markDirty}
      noValidate
    >
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={summaryFor(state, variant)}
          submission={state}
        />
      ) : null}

      <fieldset className="admin-fieldset">
        <legend>Basics</legend>
        <TextField
          id={id("name")}
          name="name"
          label="Name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited.current) setSlug(slugify(event.target.value));
          }}
          maxLength={120}
          errors={errors("name")}
          autoComplete="off"
        />
        <TextField
          id={id("slug")}
          name="slug"
          label="Web address"
          hint={`Lowercase words joined by hyphens, used in the page address /${variant === "room" ? "rooms" : "facilities"}/${slug || "…"}. Changing it on a published ${variant} changes its public address.`}
          value={slug}
          onChange={(event) => {
            slugEdited.current = true;
            setSlug(event.target.value);
          }}
          maxLength={120}
          spellCheck={false}
          autoComplete="off"
          errors={errors("slug")}
        />
        <TextAreaField
          id={id("shortDescription")}
          name="shortDescription"
          label="Short description"
          hint="One or two sentences for lists and search results. Up to 300 characters."
          maxLength={300}
          defaultValue={valueOf("shortDescription")}
          errors={errors("shortDescription")}
        />
        <TextAreaField
          id={id("description")}
          name="description"
          label="Description"
          hint={DESCRIPTION_HINT}
          rows={8}
          maxLength={20000}
          defaultValue={valueOf("description")}
          errors={errors("description")}
        />
        {variant === "facility" ? (
          <TextAreaField
            id={id("openingHoursText")}
            name="openingHoursText"
            label="Opening hours"
            optional
            hint="Plain text, e.g. “Daily 7:00–22:00”."
            maxLength={500}
            defaultValue={valueOf("openingHoursText")}
            errors={errors("openingHoursText")}
          />
        ) : null}
      </fieldset>

      {variant === "room" ? (
        <>
          <fieldset className="admin-fieldset">
            <legend>Room facts</legend>
            <p className="admin-fieldset__hint">
              Marketing facts only. Prices and availability come from the
              reservation system, not this website.
            </p>
            <div className="admin-form-grid">
              <TextField
                id={id("sizeSqm")}
                name="sizeSqm"
                label="Size (m²)"
                optional
                inputMode="decimal"
                defaultValue={valueOf("sizeSqm")}
                errors={errors("sizeSqm")}
              />
              <TextField
                id={id("maxAdults")}
                name="maxAdults"
                label="Adults"
                inputMode="numeric"
                defaultValue={valueOf("maxAdults")}
                errors={errors("maxAdults")}
              />
              <TextField
                id={id("maxChildren")}
                name="maxChildren"
                label="Children"
                inputMode="numeric"
                defaultValue={valueOf("maxChildren")}
                errors={errors("maxChildren")}
              />
            </div>
            <div className="admin-form-grid">
              <TextField
                id={id("bedSummary")}
                name="bedSummary"
                label="Beds"
                optional
                hint="e.g. “1 king bed”."
                maxLength={160}
                defaultValue={valueOf("bedSummary")}
                errors={errors("bedSummary")}
              />
              <TextField
                id={id("viewSummary")}
                name="viewSummary"
                label="View"
                optional
                hint="e.g. “Garden view”."
                maxLength={160}
                defaultValue={valueOf("viewSummary")}
                errors={errors("viewSummary")}
              />
            </div>
          </fieldset>
          <RepeatableFields
            idPrefix="features"
            legend="Features"
            itemNoun="feature"
            fields={[{ key: "label", label: "Feature", maxLength: 120 }]}
            // Controlled state survives React's post-submit form reset.
            initialRows={(values.features ?? []).map((label) => ({ label }))}
            max={MAX_ROOM_FEATURES}
            name="features"
            onChange={markDirty}
            errorsFor={(index) => errors(`features.${index}.label`)}
            emptyText="No features yet. Add short highlights such as “Walk-in shower”."
          />
        </>
      ) : null}

      <fieldset className="admin-fieldset">
        <legend>Discovery</legend>
        <label className="admin-check">
          <input
            type="checkbox"
            name="featured"
            defaultChecked={
              state.status === "error" && state.values
                ? state.values.featured === "on"
                : values.featured
            }
          />
          Feature on the home page
        </label>
        <p className="admin-fieldset__hint">
          The display order is set from the{" "}
          {variant === "room" ? "rooms" : "facilities"} list.
        </p>
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Search appearance</legend>
        <p className="admin-fieldset__hint">
          Leave blank to use the name and short description.
        </p>
        <TextField
          id={id("seoTitle")}
          name="seoTitle"
          label="Search title"
          optional
          hint="Up to 70 characters."
          maxLength={70}
          defaultValue={valueOf("seoTitle")}
          errors={errors("seoTitle")}
        />
        <TextAreaField
          id={id("seoDescription")}
          name="seoDescription"
          label="Search description"
          optional
          hint="Up to 170 characters."
          maxLength={170}
          defaultValue={valueOf("seoDescription")}
          errors={errors("seoDescription")}
        />
      </fieldset>

      <FormActions
        meta={meta}
        primary={
          <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        }
      />
    </form>
  );
}
