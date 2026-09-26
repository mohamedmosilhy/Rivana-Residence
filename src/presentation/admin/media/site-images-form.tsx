"use client";

import { useActionState, useEffect, useState } from "react";

import type { MediaOption } from "@/application/ports/repositories";
import {
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

const FIELDS = [
  ["logoMediaId", "Logo", "Shown in the website header."],
  ["stickyLogoMediaId", "Compact logo", "Shown in the header after scrolling."],
  [
    "faviconMediaId",
    "Browser icon",
    "A square PNG used in browser tabs and bookmarks.",
  ],
  [
    "defaultOgMediaId",
    "Default sharing image",
    "Used when a page without its own image is shared on social media.",
  ],
] as const;

type Field = (typeof FIELDS)[number][0];

export function SiteImagesForm({
  action,
  options,
  values,
}: Readonly<{
  action: FormAction;
  options: readonly MediaOption[];
  values: Readonly<Record<Field, string | null>>;
}>) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const [chosen, setChosen] = useState(values);

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  const asChoice = (id: string | null): ChosenImage | null =>
    id ? { mediaId: id, altOverride: null } : null;

  return (
    <form className="admin-form" action={formAction} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={[{ fieldId: "site-images", message: state.message }]}
          submission={state}
        />
      ) : null}
      {FIELDS.map(([field]) => (
        <input
          key={field}
          type="hidden"
          name={field}
          value={chosen[field] ?? ""}
        />
      ))}
      <div id="site-images" tabIndex={-1} className="admin-form-stack">
        {FIELDS.map(([field, label, hint]) => (
          <SingleImage
            key={field}
            label={label}
            hint={hint}
            options={options}
            value={asChoice(chosen[field])}
            onChange={(value) =>
              setChosen((current) => ({
                ...current,
                [field]: value?.mediaId ?? null,
              }))
            }
          />
        ))}
      </div>
      <FormActions
        primary={
          <SubmitButton pendingLabel="Saving…">Save brand images</SubmitButton>
        }
      />
    </form>
  );
}
