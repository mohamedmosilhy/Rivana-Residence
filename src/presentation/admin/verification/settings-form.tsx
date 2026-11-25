"use client";

import { useActionState, useEffect } from "react";

import {
  ErrorSummary,
  FormActions,
  SubmitButton,
} from "@/presentation/admin/ui/form";
import {
  fieldErrorsFor,
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";
import {
  check,
  checkInput,
  form,
  muted,
} from "@/presentation/admin/ui/classes";

const FIELD = "emailVerificationEnabled";
const fieldId = (name: string) => `verification-${name}`;

type Props = Readonly<{
  action: FormAction;
  enabled: boolean;
  deliveryConfigured: boolean;
}>;

/** The Admin switch for verification codes by email (Q-99). */
export function VerificationSettingsForm({
  action,
  enabled,
  deliveryConfigured,
}: Props) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  const errors = fieldErrorsFor(state, FIELD);
  const checked =
    state.status === "error" && state.values
      ? state.values[FIELD] === "on"
      : enabled;
  const describedBy =
    errors.length > 0
      ? `${fieldId("errors")} ${fieldId("hint")}`
      : fieldId("hint");

  return (
    <form className={form} action={formAction} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={errors.map((message) => ({
            fieldId: fieldId(FIELD),
            message: `Verification by email: ${message}`,
          }))}
          submission={state}
        />
      ) : null}
      <div>
        {errors.length > 0 ? (
          <ul
            className="m-0 pl-5 text-[0.875rem] font-medium text-danger"
            id={fieldId("errors")}
          >
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        <label className={check}>
          <input
            // Remount after a save so the box shows the stored value.
            key={`${enabled}-${state.status}`}
            id={fieldId(FIELD)}
            name={FIELD}
            type="checkbox"
            className={checkInput}
            defaultChecked={checked}
            aria-invalid={errors.length > 0 || undefined}
            aria-describedby={describedBy}
          />
          Allow verification codes by email
        </label>
        <p className={muted} id={fieldId("hint")}>
          {deliveryConfigured
            ? "Guests can choose email when WhatsApp is not set up or a code does not arrive. Their phone stays unverified and is confirmed at the desk. Turning this off stops new email codes at once; codes already sent can still be used until they expire."
            : "Email delivery is not set up on the server, so this can't be turned on yet."}
        </p>
      </div>
      <FormActions
        primary={<SubmitButton pendingLabel="Saving…">Save</SubmitButton>}
      />
    </form>
  );
}
