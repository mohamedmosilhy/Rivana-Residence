"use client";

import { useActionState, useEffect, useState } from "react";

import type { PageSectionType } from "@/domain/content/page-sections";
import {
  SECTION_FIELDS,
  editorStateFromPayload,
  sectionFieldId,
} from "@/presentation/admin/pages/section-fields";
import {
  ErrorSummary,
  FormActions,
  SubmitButton,
  TextField,
} from "@/presentation/admin/ui/form";
import {
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";
import { useUnsavedChanges } from "@/presentation/admin/ui/use-unsaved-changes";

type SectionEditorProps = Readonly<{
  sectionId: string;
  type: PageSectionType;
  heading: string | null;
  eyebrow: string | null;
  isVisible: boolean;
  /** Required sections can be edited but never hidden. */
  locked: boolean;
  payload: unknown;
  action: FormAction;
}>;

export function SectionEditor({
  sectionId,
  type,
  heading,
  eyebrow,
  isVisible,
  locked,
  payload,
  action,
}: SectionEditorProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const { markDirty, markSaved } = useUnsavedChanges();
  const [editor, setEditor] = useState(() =>
    editorStateFromPayload(type, payload),
  );
  const [meta, setMeta] = useState({
    heading: heading ?? "",
    eyebrow: eyebrow ?? "",
    isVisible,
  });

  useEffect(() => {
    if (state.status === "success") {
      markSaved();
      toast(state.message);
    }
  }, [state, toast, markSaved]);

  // Server paths such as "document.content.2.content.0.text" belong to the
  // field that owns their first segments.
  const errors = (path: string) =>
    state.status === "error"
      ? Object.entries(state.fieldErrors ?? {})
          .filter(([key]) => key === path || key.startsWith(`${path}.`))
          .flatMap(([, messages]) => messages)
      : [];

  const Fields = SECTION_FIELDS[type];
  const id = (path: string) => sectionFieldId(sectionId, path);
  const summary =
    state.status === "error"
      ? Object.entries(state.fieldErrors ?? {}).flatMap(([path, messages]) => {
          const owner =
            path.startsWith("document") || path.startsWith("body")
              ? path.split(".")[0]!
              : path.split(".").length > 3
                ? path.split(".").slice(0, 3).join(".")
                : path;
          return messages.map((message) => ({
            fieldId:
              owner === "type" || owner === "sections"
                ? id("heading")
                : id(owner),
            message,
          }));
        })
      : [];

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
          errors={summary}
          submission={state}
        />
      ) : null}
      <input type="hidden" name="payload" value={JSON.stringify(editor)} />
      <div className="admin-form-grid">
        <TextField
          id={id("eyebrow")}
          name="eyebrow"
          label="Small heading above"
          optional
          maxLength={80}
          value={meta.eyebrow}
          onChange={(event) =>
            setMeta({ ...meta, eyebrow: event.target.value })
          }
          errors={errors("eyebrow")}
        />
        <TextField
          id={id("heading")}
          name="heading"
          label="Section heading"
          optional
          maxLength={160}
          value={meta.heading}
          onChange={(event) =>
            setMeta({ ...meta, heading: event.target.value })
          }
          errors={errors("heading")}
        />
      </div>
      <Fields
        sectionId={sectionId}
        state={editor}
        onChange={(next) => {
          setEditor(next);
          markDirty();
        }}
        errors={errors}
      />
      <div className="admin-field">
        <label className="admin-check">
          <input
            type="checkbox"
            id={id("isVisible")}
            name="isVisible"
            checked={locked || meta.isVisible}
            disabled={locked}
            aria-describedby={locked ? id("locked") : undefined}
            onChange={(event) =>
              setMeta({ ...meta, isVisible: event.target.checked })
            }
          />
          Show this section on the page
        </label>
        {locked ? (
          <>
            {/* A disabled checkbox is not submitted, so send the value. */}
            <input type="hidden" name="isVisible" value="on" />
            <p className="admin-field__hint" id={id("locked")}>
              Required on this page, so it is always shown.
            </p>
          </>
        ) : null}
        {errors("isVisible").length > 0 ? (
          <ul className="admin-field__errors">
            {errors("isVisible").map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <FormActions
        primary={
          <SubmitButton pendingLabel="Saving…">Save section</SubmitButton>
        }
      />
    </form>
  );
}
