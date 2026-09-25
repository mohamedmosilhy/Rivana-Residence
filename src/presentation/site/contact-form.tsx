"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";

const FIELDS = [
  {
    name: "name",
    label: "Your name",
    type: "text",
    autoComplete: "name",
    maxLength: 120,
    required: true,
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    autoComplete: "email",
    maxLength: 320,
    required: true,
  },
  {
    name: "phone",
    label: "Phone",
    type: "tel",
    autoComplete: "tel",
    maxLength: 40,
    required: false,
  },
  {
    name: "subject",
    label: "Subject",
    type: "text",
    autoComplete: "off",
    maxLength: 160,
    required: false,
  },
] as const;

// Works without JavaScript (a plain form post to the Server Action). With
// JavaScript it shows pending state, keeps what was typed after an error,
// and moves focus to the result so it is announced.
export function ContactForm({
  action,
  formToken,
}: Readonly<{ action: FormAction; formToken: string }>) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle") statusRef.current?.focus();
  }, [state]);

  if (state.status === "success") {
    return (
      <div
        ref={statusRef}
        tabIndex={-1}
        role="status"
        className="site-form__success"
      >
        <h3>Thank you</h3>
        <p>{state.message}</p>
      </div>
    );
  }

  const errors = (field: string) =>
    state.status === "error" ? (state.fieldErrors?.[field] ?? []) : [];
  const value = (field: string) =>
    state.status === "error" ? (state.values?.[field] ?? "") : "";

  return (
    <form className="site-form" action={formAction} noValidate>
      {state.status === "error" ? (
        <div
          ref={statusRef}
          tabIndex={-1}
          role="alert"
          className="site-form__error"
        >
          {state.message}
        </div>
      ) : null}
      <input type="hidden" name="formToken" value={formToken} />
      {/* Hidden from people; bots that fill it are ignored. */}
      <div className="site-form__trap" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className="site-form__grid">
        {FIELDS.map((field) => {
          const id = `contact-${field.name}`;
          const fieldErrors = errors(field.name);
          return (
            <div className="site-field" key={field.name}>
              <label htmlFor={id}>
                {field.label}
                {field.required ? null : (
                  <span className="site-field__optional"> (optional)</span>
                )}
              </label>
              <input
                id={id}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                maxLength={field.maxLength}
                required={field.required}
                defaultValue={value(field.name)}
                aria-invalid={fieldErrors.length > 0 || undefined}
                aria-describedby={
                  fieldErrors.length > 0 ? `${id}-error` : undefined
                }
              />
              {fieldErrors.length > 0 ? (
                <p className="site-field__error" id={`${id}-error`}>
                  {fieldErrors.join(" ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="site-field">
        <label htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          name="message"
          rows={6}
          maxLength={4000}
          required
          defaultValue={value("message")}
          aria-invalid={errors("message").length > 0 || undefined}
          aria-describedby={
            errors("message").length > 0 ? "contact-message-error" : undefined
          }
        />
        {errors("message").length > 0 ? (
          <p className="site-field__error" id="contact-message-error">
            {errors("message").join(" ")}
          </p>
        ) : null}
      </div>
      <p className="site-form__note">
        We use your details only to reply to this message.
      </p>
      <button type="submit" className="site-button" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
