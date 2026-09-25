"use client";

import { useActionState, useEffect, useState } from "react";

import type { MediaOption } from "@/application/ports/repositories";
import type { SectionMediaSlot } from "@/domain/media/media-asset";
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

type SectionImagesFormProps = Readonly<{
  sectionId: string;
  slots: readonly SectionMediaSlot[];
  options: readonly MediaOption[];
  initial: Readonly<Record<string, readonly ChosenImage[]>>;
  action: FormAction;
}>;

/** The images a page section may hold, per the section registry. */
export function SectionImagesForm({
  sectionId,
  slots,
  options,
  initial,
  action,
}: SectionImagesFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const [chosen, setChosen] = useState(initial);

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  const set = (role: string, value: readonly ChosenImage[]) =>
    setChosen((current) => ({ ...current, [role]: value }));

  return (
    <form className="admin-form" action={formAction} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={[
            { fieldId: `section-images-${sectionId}`, message: state.message },
          ]}
          submission={state}
        />
      ) : null}
      <input type="hidden" name="media" value={JSON.stringify(chosen)} />
      <div
        id={`section-images-${sectionId}`}
        tabIndex={-1}
        className="admin-form-stack"
      >
        {slots.map((slot) =>
          slot.multiple ? (
            <ImageList
              key={slot.role}
              label={slot.label}
              options={options}
              value={chosen[slot.role] ?? []}
              onChange={(value) => set(slot.role, value)}
            />
          ) : (
            <SingleImage
              key={slot.role}
              label={slot.label}
              options={options}
              value={chosen[slot.role]?.[0] ?? null}
              onChange={(value) => set(slot.role, value ? [value] : [])}
              withAltOverride
            />
          ),
        )}
      </div>
      <FormActions
        primary={
          <SubmitButton pendingLabel="Saving…">
            Save section images
          </SubmitButton>
        }
      />
    </form>
  );
}
