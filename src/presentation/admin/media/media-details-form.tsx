"use client";

import { useActionState, useEffect, useState, type MouseEvent } from "react";

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

type MediaDetailsFormProps = Readonly<{
  action: FormAction;
  src: string;
  width: number;
  height: number;
  altText: string;
  caption: string;
  credit: string;
  /** 0–1, or null when unset. */
  focalX: number | null;
  focalY: number | null;
}>;

const LABELS: Record<string, string> = {
  altText: "Alt text",
  caption: "Caption",
  credit: "Credit",
  focalX: "Horizontal focal point",
  focalY: "Vertical focal point",
};

const pct = (value: number | null) =>
  value === null ? "" : String(Math.round(value * 100));

// Focal point: the numeric inputs are the accessible control; clicking the
// preview is a pointer shortcut that fills them in.
export function MediaDetailsForm(props: MediaDetailsFormProps) {
  const [state, formAction] = useActionState(props.action, idleFormState);
  const toast = useToast();
  const { markDirty, markSaved } = useUnsavedChanges();
  const [focal, setFocal] = useState({
    x: pct(props.focalX),
    y: pct(props.focalY),
  });

  useEffect(() => {
    if (state.status === "success") {
      markSaved();
      toast(state.message);
    }
  }, [state, toast, markSaved]);

  const valueOf = (
    field: "altText" | "caption" | "credit",
    fallback: string,
  ) =>
    state.status === "error" && state.values
      ? (state.values[field] ?? "")
      : fallback;

  function pick(event: MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - box.left) / box.width) * 100);
    const y = Math.round(((event.clientY - box.top) / box.height) * 100);
    setFocal({
      x: String(Math.min(100, Math.max(0, x))),
      y: String(Math.min(100, Math.max(0, y))),
    });
    markDirty();
  }

  const markerX = Number(focal.x);
  const markerY = Number(focal.y);
  const hasMarker =
    focal.x !== "" &&
    focal.y !== "" &&
    !Number.isNaN(markerX) &&
    !Number.isNaN(markerY);

  return (
    <div className="admin-media-details">
      <div className="admin-media-details__preview">
        <button
          type="button"
          className="admin-focal"
          onClick={pick}
          tabIndex={-1}
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the stored object is shown as is */}
          <img
            src={props.src}
            alt=""
            width={props.width}
            height={props.height}
          />
          {hasMarker ? (
            <span
              className="admin-focal__marker"
              style={{ left: `${markerX}%`, top: `${markerY}%` }}
            />
          ) : null}
        </button>
        <p className="admin-muted">
          Click the image to set the point that must stay visible when it is
          cropped, or enter it below.
        </p>
      </div>
      <form
        className="admin-form"
        action={formAction}
        onInput={markDirty}
        noValidate
      >
        {state.status === "error" ? (
          <ErrorSummary
            title={state.message}
            errors={Object.entries(state.fieldErrors ?? {}).flatMap(
              ([field, messages]) =>
                messages.map((message) => ({
                  fieldId: `media-${field}`,
                  message: `${LABELS[field] ?? field}: ${message}`,
                })),
            )}
            submission={state}
          />
        ) : null}
        <TextAreaField
          id="media-altText"
          name="altText"
          label="Alt text"
          hint="Describe what the image shows for people who cannot see it, e.g. “Outdoor pool with loungers at sunset”. Needed before the image can appear on a published page."
          maxLength={300}
          rows={3}
          defaultValue={valueOf("altText", props.altText)}
          errors={fieldErrorsFor(state, "altText")}
        />
        <TextAreaField
          id="media-caption"
          name="caption"
          label="Caption"
          optional
          maxLength={500}
          rows={2}
          defaultValue={valueOf("caption", props.caption)}
          errors={fieldErrorsFor(state, "caption")}
        />
        <TextField
          id="media-credit"
          name="credit"
          label="Credit"
          optional
          hint="e.g. the photographer."
          maxLength={300}
          defaultValue={valueOf("credit", props.credit)}
          errors={fieldErrorsFor(state, "credit")}
        />
        <fieldset className="admin-fieldset admin-fieldset--nested">
          <legend>Focal point</legend>
          <p className="admin-fieldset__hint">
            Percent from the left and from the top. Leave both empty to use the
            centre.
          </p>
          <div className="admin-form-grid">
            <TextField
              id="media-focalX"
              name="focalX"
              label="From the left (%)"
              inputMode="numeric"
              value={focal.x}
              onChange={(event) =>
                setFocal({ ...focal, x: event.target.value })
              }
              errors={fieldErrorsFor(state, "focalX")}
            />
            <TextField
              id="media-focalY"
              name="focalY"
              label="From the top (%)"
              inputMode="numeric"
              value={focal.y}
              onChange={(event) =>
                setFocal({ ...focal, y: event.target.value })
              }
              errors={fieldErrorsFor(state, "focalY")}
            />
          </div>
        </fieldset>
        <FormActions
          primary={
            <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
          }
        />
      </form>
    </div>
  );
}
