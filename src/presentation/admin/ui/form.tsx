"use client";

import {
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { useFormStatus } from "react-dom";

export type SummaryError = Readonly<{ fieldId: string; message: string }>;

// Shown after a failed submission. It takes focus so keyboard and screen
// reader users land on the problem list; each item links to its field.
export function ErrorSummary({
  title,
  errors,
  submission,
}: Readonly<{
  title: string;
  errors: readonly SummaryError[];
  /** Changes on every submission so a repeated failure is re-focused. */
  submission: unknown;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [submission]);

  return (
    <div
      ref={ref}
      className="admin-error-summary"
      role="alert"
      tabIndex={-1}
      aria-labelledby="error-summary-title"
    >
      <h2 id="error-summary-title">{title}</h2>
      {errors.length > 0 ? (
        <ul>
          {errors.map((error) => (
            <li key={`${error.fieldId}:${error.message}`}>
              <a
                href={`#${error.fieldId}`}
                onClick={(event) => {
                  const field = document.getElementById(error.fieldId);
                  if (!field) return;
                  event.preventDefault();
                  field.focus();
                }}
              >
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type FieldShellProps = Readonly<{
  id: string;
  label: string;
  hint?: ReactNode | undefined;
  errors?: readonly string[] | undefined;
  optional?: boolean | undefined;
  children: (describedBy: string | undefined, invalid: boolean) => ReactNode;
}>;

export function FieldShell({
  id,
  label,
  hint,
  errors = [],
  optional = false,
  children,
}: FieldShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors.length > 0 ? `${id}-errors` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="admin-field">
      <label htmlFor={id}>
        {label}
        {optional ? (
          <span className="admin-field__optional"> (optional)</span>
        ) : null}
      </label>
      {hint ? (
        <p className="admin-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {errorId ? (
        <ul className="admin-field__errors" id={errorId}>
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {children(describedBy, errors.length > 0)}
    </div>
  );
}

type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "children"
> &
  Omit<FieldShellProps, "children">;

export function TextField({
  id,
  label,
  hint,
  errors,
  optional,
  ...input
}: TextFieldProps) {
  return (
    <FieldShell {...{ id, label, hint, errors, optional }}>
      {(describedBy, invalid) => (
        <input
          id={id}
          type="text"
          {...input}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldShell>
  );
}

type TextAreaFieldProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "children"
> &
  Omit<FieldShellProps, "children">;

export function TextAreaField({
  id,
  label,
  hint,
  errors,
  optional,
  ...textarea
}: TextAreaFieldProps) {
  return (
    <FieldShell {...{ id, label, hint, errors, optional }}>
      {(describedBy, invalid) => (
        <textarea
          id={id}
          rows={3}
          {...textarea}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldShell>
  );
}

/**
 * Disables itself while its form's action is running, which blocks
 * duplicate submissions from double clicks or repeated Enter presses.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  pending: pendingOverride,
}: Readonly<{
  children: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger";
  pending?: boolean;
}>) {
  const status = useFormStatus();
  const pending = pendingOverride ?? status.pending;
  return (
    <button
      type="submit"
      className={`admin-button admin-button--${variant}`}
      disabled={pending}
      aria-disabled={pending || undefined}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * The one place form actions live: the primary action (Save, Publish) sits
 * at the end; secondary and destructive actions (Archive, Delete) sit at the
 * start, away from it. `meta` holds status such as "Last saved …".
 */
export function FormActions({
  primary,
  secondary,
  meta,
}: Readonly<{
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
}>) {
  return (
    <div className="admin-form-actions">
      {meta ? <div className="admin-form-actions__meta">{meta}</div> : null}
      <div className="admin-form-actions__buttons">
        {secondary ? (
          <div className="admin-form-actions__secondary">{secondary}</div>
        ) : null}
        {primary}
      </div>
    </div>
  );
}
