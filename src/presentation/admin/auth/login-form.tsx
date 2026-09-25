"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  idleFormState,
  type FormAction,
} from "@/presentation/admin/auth/form-state";

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
    <form className="admin-form" action={formAction} noValidate>
      <input type="hidden" name="returnTo" value={returnTo} />

      {hasError ? (
        <div
          ref={errorRef}
          className="admin-form__error"
          role="alert"
          tabIndex={-1}
          id="login-error"
        >
          {state.message}
        </div>
      ) : null}

      <div className="admin-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          defaultValue={hasError ? (state.values?.email ?? "") : ""}
          spellCheck={false}
          required
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "login-error" : undefined}
        />
      </div>

      <div className="admin-field">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "login-error" : undefined}
        />
      </div>

      <button className="admin-button" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
