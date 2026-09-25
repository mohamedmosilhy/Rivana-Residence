"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  idleFormState,
  type FormAction,
} from "@/presentation/admin/auth/form-state";

export function PasswordForm({ action }: Readonly<{ action: FormAction }>) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  const statusRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "idle") return;
    statusRef.current?.focus();
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  const errorsFor = (field: string) =>
    state.status === "error" ? (state.fieldErrors?.[field] ?? []) : [];

  return (
    <form ref={formRef} className="admin-form" action={formAction} noValidate>
      {state.status !== "idle" ? (
        <div
          ref={statusRef}
          tabIndex={-1}
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "admin-form__error"
              : "admin-form__success"
          }
        >
          {state.message}
        </div>
      ) : null}

      {(
        [
          ["currentPassword", "Current password", "current-password"],
          ["newPassword", "New password", "new-password"],
        ] as const
      ).map(([name, label, autoComplete]) => {
        const errors = errorsFor(name);
        const hintId = name === "newPassword" ? "new-password-hint" : undefined;
        const errorId = errors.length > 0 ? `${name}-errors` : undefined;
        return (
          <div className="admin-field" key={name}>
            <label htmlFor={name}>{label}</label>
            {hintId ? (
              <p className="admin-field__hint" id={hintId}>
                At least 12 characters. Changing it signs out your other
                sessions.
              </p>
            ) : null}
            <input
              id={name}
              name={name}
              type="password"
              autoComplete={autoComplete}
              required
              aria-invalid={errors.length > 0 || undefined}
              aria-describedby={
                [hintId, errorId].filter(Boolean).join(" ") || undefined
              }
            />
            {errorId ? (
              <ul className="admin-field__errors" id={errorId}>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}

      <button className="admin-button" type="submit" disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </button>
    </form>
  );
}
