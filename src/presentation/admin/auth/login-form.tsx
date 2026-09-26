"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import {
  button,
  control,
  field,
  fieldLabel,
  form,
  formError,
} from "@/presentation/admin/ui/classes";

type LoginFormProps = Readonly<{
  action: FormAction;
  returnTo: string;
}>;

export function LoginForm({ action, returnTo }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  const errorRef = useRef<HTMLDivElement>(null);
  const hasError = state.status === "error";

  useEffect(() => {
    if (hasError) errorRef.current?.focus();
  }, [state, hasError]);

  return (
    <form className={form} action={formAction} noValidate>
      <input type="hidden" name="returnTo" value={returnTo} />

      {hasError ? (
        <div
          ref={errorRef}
          className={formError}
          role="alert"
          tabIndex={-1}
          id="login-error"
        >
          {state.message}
        </div>
      ) : null}

      <div className={field}>
        <label htmlFor="login-email" className={fieldLabel}>
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          className={control}
          autoComplete="username"
          inputMode="email"
          defaultValue={hasError ? (state.values?.email ?? "") : ""}
          spellCheck={false}
          required
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "login-error" : undefined}
        />
      </div>

      <div className={field}>
        <label htmlFor="login-password" className={fieldLabel}>
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          className={control}
          autoComplete="current-password"
          required
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "login-error" : undefined}
        />
      </div>

      <button
        className={button("primary", { stretch: true })}
        type="submit"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
