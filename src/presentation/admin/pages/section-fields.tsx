"use client";

import {
  CTA_INTENTS,
  type PageSectionType,
} from "@/domain/content/page-sections";
import { editorTextFromRichText } from "@/domain/shared/rich-text";
import { DESCRIPTION_HINT } from "@/presentation/admin/content/catalog-form";
import { FieldShell } from "@/presentation/admin/ui/form";
import { RepeatableFields } from "@/presentation/admin/ui/repeatable-fields";

// Editor state is a plain object of strings and booleans per section type.
// The server converts it to the stored payload and validates it against the
// same allowlisted schema registry, so nothing here is trusted.
export type SectionEditorState = Record<string, unknown>;

type FieldsProps = Readonly<{
  sectionId: string;
  state: SectionEditorState;
  onChange: (next: SectionEditorState) => void;
  errors: (path: string) => readonly string[];
}>;

export function sectionFieldId(sectionId: string, path: string) {
  return `s-${sectionId}-${path.replace(/\./g, "-")}`;
}

const CTA_LABELS: Record<(typeof CTA_INTENTS)[number], string> = {
  BOOKING: "Booking (shows as unavailable until booking is connected)",
  CONTACT: "Contact page",
  ROOMS: "Rooms",
  FACILITIES: "Facilities",
};

const record = (value: unknown) =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Converts a stored payload into editor state. */
export function editorStateFromPayload(
  type: PageSectionType,
  payload: unknown,
): SectionEditorState {
  const value = record(payload);
  const cta = record(value.cta);
  const ctaState = {
    label: text(cta.label),
    intent: text(cta.intent) || "CONTACT",
  };
  switch (type) {
    case "HERO":
      return {
        title: text(value.title),
        summary: text(value.summary),
        cta: ctaState,
      };
    case "RICH_TEXT":
      return { documentText: editorTextFromRichText(value.document) };
    case "IMAGE_TEXT_SPLIT":
      return {
        bodyText: editorTextFromRichText(value.body),
        imageSide: text(value.imageSide) || "LEFT",
        cta: ctaState,
      };
    case "GALLERY":
      return { layout: text(value.layout) || "EDITORIAL" };
    case "ROOM_GRID":
    case "FACILITY_GRID":
      return {
        limit: typeof value.limit === "number" ? String(value.limit) : "3",
        featuredOnly: value.featuredOnly === true,
      };
    case "CONTACT_CTA":
      return {
        body: text(value.body),
        formEnabled: value.formEnabled === true,
      };
    case "FEATURE_GRID":
    case "STATS":
      return {
        items: Array.isArray(value.items)
          ? value.items.map((item) =>
              Object.fromEntries(
                Object.entries(record(item)).map(([key, field]) => [
                  key,
                  text(field),
                ]),
              ),
            )
          : [],
      };
  }
}

function Text({
  sectionId,
  path,
  label,
  hint,
  multiline,
  rows,
  maxLength,
  optional,
  value,
  onChange,
  errors,
}: Readonly<{
  sectionId: string;
  path: string;
  label: string;
  hint?: string;
  multiline?: boolean;
  rows?: number;
  maxLength: number;
  optional?: boolean;
  value: string;
  onChange: (value: string) => void;
  errors: readonly string[];
}>) {
  const id = sectionFieldId(sectionId, path);
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      errors={errors}
      optional={optional}
    >
      {(describedBy, invalid) =>
        multiline ? (
          <textarea
            id={id}
            rows={rows ?? 3}
            maxLength={maxLength}
            value={value}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            id={id}
            maxLength={maxLength}
            value={value}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      }
    </FieldShell>
  );
}

function Choice({
  sectionId,
  path,
  label,
  value,
  options,
  onChange,
  errors,
}: Readonly<{
  sectionId: string;
  path: string;
  label: string;
  value: string;
  options: readonly Readonly<{ value: string; label: string }>[];
  onChange: (value: string) => void;
  errors: readonly string[];
}>) {
  const id = sectionFieldId(sectionId, path);
  return (
    <FieldShell id={id} label={label} errors={errors}>
      {(describedBy, invalid) => (
        <select
          id={id}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

function Toggle({
  sectionId,
  path,
  label,
  checked,
  onChange,
}: Readonly<{
  sectionId: string;
  path: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}>) {
  return (
    <label className="admin-check">
      <input
        type="checkbox"
        id={sectionFieldId(sectionId, path)}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function CallToAction({ sectionId, state, onChange, errors }: FieldsProps) {
  const cta = record(state.cta);
  const set = (patch: Record<string, string>) =>
    onChange({ ...state, cta: { ...cta, ...patch } });
  return (
    <fieldset className="admin-fieldset admin-fieldset--nested">
      <legend>Button</legend>
      <div className="admin-form-grid">
        <Text
          sectionId={sectionId}
          path="cta.label"
          label="Button text"
          optional
          hint="Leave blank for no button."
          maxLength={60}
          value={text(cta.label)}
          onChange={(label) => set({ label })}
          errors={errors("cta.label")}
        />
        <Choice
          sectionId={sectionId}
          path="cta.intent"
          label="Button goes to"
          value={text(cta.intent) || "CONTACT"}
          options={CTA_INTENTS.map((intent) => ({
            value: intent,
            label: CTA_LABELS[intent],
          }))}
          onChange={(intent) => set({ intent })}
          errors={errors("cta.intent")}
        />
      </div>
    </fieldset>
  );
}

function GridFields({
  noun,
  ...props
}: FieldsProps & Readonly<{ noun: string }>) {
  const { sectionId, state, onChange, errors } = props;
  return (
    <>
      <Text
        sectionId={sectionId}
        path="limit"
        label={`Number of ${noun} to show`}
        hint={`Between 1 and 12. Published ${noun} are shown in their display order.`}
        maxLength={2}
        value={text(state.limit)}
        onChange={(limit) => onChange({ ...state, limit })}
        errors={errors("limit")}
      />
      <Toggle
        sectionId={sectionId}
        path="featuredOnly"
        label={`Only featured ${noun}`}
        checked={state.featuredOnly === true}
        onChange={(featuredOnly) => onChange({ ...state, featuredOnly })}
      />
    </>
  );
}

function ItemsFields({
  fields,
  itemNoun,
  ...props
}: FieldsProps &
  Readonly<{
    itemNoun: string;
    fields: readonly Readonly<{
      key: string;
      label: string;
      maxLength: number;
      multiline?: boolean;
    }>[];
  }>) {
  const { sectionId, state, onChange, errors } = props;
  return (
    <RepeatableFields
      idPrefix={sectionFieldId(sectionId, "items")}
      legend="Items"
      itemNoun={itemNoun}
      fields={fields}
      initialRows={(state.items as Record<string, string>[]) ?? []}
      min={1}
      max={8}
      onChange={(items) => onChange({ ...state, items })}
      errorsFor={(index, key) => errors(`items.${index}.${key}`)}
    />
  );
}

// The allowlisted registry: each section type maps to exactly one editor.
export const SECTION_FIELDS: Record<
  PageSectionType,
  (props: FieldsProps) => React.ReactNode
> = {
  HERO: (props) => (
    <>
      <Text
        sectionId={props.sectionId}
        path="title"
        label="Title"
        maxLength={120}
        value={text(props.state.title)}
        onChange={(title) => props.onChange({ ...props.state, title })}
        errors={props.errors("title")}
      />
      <Text
        sectionId={props.sectionId}
        path="summary"
        label="Summary"
        multiline
        maxLength={400}
        value={text(props.state.summary)}
        onChange={(summary) => props.onChange({ ...props.state, summary })}
        errors={props.errors("summary")}
      />
      <CallToAction {...props} />
    </>
  ),
  RICH_TEXT: (props) => (
    <Text
      sectionId={props.sectionId}
      path="document"
      label="Text"
      hint={DESCRIPTION_HINT}
      multiline
      rows={8}
      maxLength={20000}
      value={text(props.state.documentText)}
      onChange={(documentText) =>
        props.onChange({ ...props.state, documentText })
      }
      errors={props.errors("document")}
    />
  ),
  IMAGE_TEXT_SPLIT: (props) => (
    <>
      <Text
        sectionId={props.sectionId}
        path="body"
        label="Text"
        hint={DESCRIPTION_HINT}
        multiline
        rows={6}
        maxLength={20000}
        value={text(props.state.bodyText)}
        onChange={(bodyText) => props.onChange({ ...props.state, bodyText })}
        errors={props.errors("body")}
      />
      <Choice
        sectionId={props.sectionId}
        path="imageSide"
        label="Image position"
        value={text(props.state.imageSide)}
        options={[
          { value: "LEFT", label: "Image on the left" },
          { value: "RIGHT", label: "Image on the right" },
        ]}
        onChange={(imageSide) => props.onChange({ ...props.state, imageSide })}
        errors={props.errors("imageSide")}
      />
      <CallToAction {...props} />
    </>
  ),
  GALLERY: (props) => (
    <Choice
      sectionId={props.sectionId}
      path="layout"
      label="Layout"
      value={text(props.state.layout)}
      options={[
        { value: "EDITORIAL", label: "Editorial (mixed sizes)" },
        { value: "GRID", label: "Even grid" },
      ]}
      onChange={(layout) => props.onChange({ ...props.state, layout })}
      errors={props.errors("layout")}
    />
  ),
  FEATURE_GRID: (props) => (
    <ItemsFields
      {...props}
      itemNoun="item"
      fields={[
        { key: "title", label: "Title", maxLength: 80 },
        { key: "body", label: "Text", maxLength: 240, multiline: true },
      ]}
    />
  ),
  ROOM_GRID: (props) => <GridFields {...props} noun="rooms" />,
  FACILITY_GRID: (props) => <GridFields {...props} noun="facilities" />,
  CONTACT_CTA: (props) => (
    <>
      <Text
        sectionId={props.sectionId}
        path="body"
        label="Text"
        multiline
        maxLength={400}
        value={text(props.state.body)}
        onChange={(body) => props.onChange({ ...props.state, body })}
        errors={props.errors("body")}
      />
      <Toggle
        sectionId={props.sectionId}
        path="formEnabled"
        label="Show the enquiry form"
        checked={props.state.formEnabled === true}
        onChange={(formEnabled) =>
          props.onChange({ ...props.state, formEnabled })
        }
      />
    </>
  ),
  STATS: (props) => (
    <ItemsFields
      {...props}
      itemNoun="figure"
      fields={[
        { key: "value", label: "Figure", maxLength: 30 },
        { key: "label", label: "Label", maxLength: 80 },
      ]}
    />
  ),
};
