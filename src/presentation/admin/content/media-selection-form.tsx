"use client";

import { useActionState, useEffect, useId, useState } from "react";

import type { MediaOption } from "@/application/ports/repositories";
import {
  ErrorSummary,
  FieldShell,
  FormActions,
  SubmitButton,
} from "@/presentation/admin/ui/form";
import {
  fieldErrorsFor,
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";

type MediaSelectionFormProps = Readonly<{
  noun: string;
  action: FormAction;
  options: readonly MediaOption[];
  heroId: string | null;
  galleryIds: readonly string[];
}>;

function describe(option: MediaOption) {
  const size =
    option.width && option.height ? ` (${option.width}×${option.height})` : "";
  return `${option.altText || "No alt text"} — ${option.originalFilename}${size}`;
}

// Chooses from images that are already in the library. Uploading arrives
// with the media library; until then this lists only ready images.
export function MediaSelectionForm({
  noun,
  action,
  options,
  heroId,
  galleryIds,
}: MediaSelectionFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const [hero, setHero] = useState(heroId ?? "");
  const [gallery, setGallery] = useState<readonly string[]>(galleryIds);
  const galleryLegend = useId();

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  if (options.length === 0) {
    return (
      <p className="admin-muted">
        There are no images in the library yet, so a hero image cannot be
        chosen. Image upload arrives with the media library; a {noun} needs a
        hero image before it can be published.
      </p>
    );
  }

  const summary =
    state.status === "error"
      ? Object.entries(state.fieldErrors ?? {}).flatMap(([field, messages]) =>
          messages.map((message) => ({
            fieldId: field === "gallery" ? "media-gallery-0" : "media-hero",
            message,
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
      <input
        type="hidden"
        name="galleryMediaIds"
        value={JSON.stringify(gallery.filter((id) => id !== hero))}
      />
      <FieldShell
        id="media-hero"
        label="Hero image"
        hint={`The main image for this ${noun}. Required to publish.`}
        errors={fieldErrorsFor(state, "hero")}
      >
        {(describedBy, invalid) => (
          <select
            id="media-hero"
            name="heroMediaId"
            value={hero}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => setHero(event.target.value)}
          >
            <option value="">No hero image</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {describe(option)}
              </option>
            ))}
          </select>
        )}
      </FieldShell>
      <fieldset className="admin-fieldset" aria-describedby={galleryLegend}>
        <legend>Gallery images</legend>
        <p className="admin-fieldset__hint" id={galleryLegend}>
          Shown after the hero image, in the order listed here.
        </p>
        <ul className="admin-checklist">
          {options
            .filter((option) => option.id !== hero)
            .map((option, index) => (
              <li key={option.id}>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    id={`media-gallery-${index}`}
                    checked={gallery.includes(option.id)}
                    onChange={(event) =>
                      setGallery((current) =>
                        event.target.checked
                          ? [...current, option.id]
                          : current.filter((id) => id !== option.id),
                      )
                    }
                  />
                  {describe(option)}
                </label>
              </li>
            ))}
        </ul>
      </fieldset>
      <FormActions
        primary={
          <SubmitButton pendingLabel="Saving…">Save images</SubmitButton>
        }
      />
    </form>
  );
}
