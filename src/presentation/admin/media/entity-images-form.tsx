"use client";

import { useActionState, useEffect, useState } from "react";

import type { MediaOption } from "@/application/ports/repositories";
import {
  ImageList,
  SingleImage,
  type ChosenImage,
} from "@/presentation/admin/media/image-choice";
import {
  ErrorSummary,
  FormActions,
  SubmitButton,
} from "@/presentation/admin/ui/form";
import {
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";
import { useUnsavedChanges } from "@/presentation/admin/ui/use-unsaved-changes";

type EntityImagesFormProps = Readonly<{
  noun: string;
  action: FormAction;
  options: readonly MediaOption[];
  hero: ChosenImage | null;
  gallery: readonly ChosenImage[];
  social: string | null;
}>;

/** Hero, ordered gallery, and optional sharing image for a room or facility. */
export function EntityImagesForm({
  noun,
  action,
  options,
  hero: initialHero,
  gallery: initialGallery,
  social: initialSocial,
}: EntityImagesFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const { markDirty, markSaved } = useUnsavedChanges();
  const [hero, setHero] = useState(initialHero);
  const [gallery, setGallery] = useState(initialGallery);
  const [social, setSocial] = useState<ChosenImage | null>(
    initialSocial ? { mediaId: initialSocial, altOverride: null } : null,
  );

  useEffect(() => {
    if (state.status === "success") {
      markSaved();
      toast(state.message);
    }
  }, [state, toast, markSaved]);

  const change =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      markDirty();
    };

  return (
    <form className="admin-form" action={formAction} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={Object.values(state.fieldErrors ?? {})
            .flat()
            .map((message) => ({ fieldId: "entity-images", message }))}
          submission={state}
        />
      ) : null}
      <input
        type="hidden"
        name="media"
        value={JSON.stringify({ hero, gallery, social })}
      />
      <div id="entity-images" tabIndex={-1} className="admin-form-stack">
        <SingleImage
          label="Hero image"
          hint={`The main image for this ${noun}. Required to publish.`}
          options={options}
          value={hero}
          onChange={change(setHero)}
          withAltOverride
        />
        <ImageList
          label="Gallery"
          hint="Shown after the hero image, in this order."
          options={options}
          value={gallery}
          onChange={change(setGallery)}
          exclude={hero ? [hero.mediaId] : []}
        />
        <SingleImage
          label="Sharing image"
          hint="Optional. Shown when the page is shared on social media; the hero image is used otherwise."
          options={options}
          value={social}
          onChange={change(setSocial)}
        />
      </div>
      <FormActions
        primary={
          <SubmitButton pendingLabel="Saving…">Save images</SubmitButton>
        }
      />
    </form>
  );
}
