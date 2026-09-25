"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import {
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { Icon } from "@/presentation/site/icons";
import { SunRays } from "@/presentation/site/ornaments";

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

const MESSAGE_MAX = 4000;
const REQUIRED = ["name", "email", "message"] as const;
// One-tap subjects. They only fill the Subject field, which stays editable.
const TOPICS = [
  "Rooms and stays",
  "A longer stay",
  "Facilities",
  "Something else",
] as const;

/**
 * The enquiry form. It posts to a Server Action and works without
 * JavaScript. With JavaScript it adds floating labels that confirm each
 * completed field, one-tap subjects, a live count of the required details,
 * a growing message box, and a drawn confirmation seal. "Write another
 * message" starts a fresh form.
 */
export function ContactForm({
  action,
  formToken,
}: Readonly<{ action: FormAction; formToken: string }>) {
  const [round, setRound] = useState(0);
  return (
    <EnquiryForm
      key={round}
      action={action}
      formToken={formToken}
      focusOnMount={round > 0}
      onWriteAnother={() => setRound((value) => value + 1)}
    />
  );
}

function EnquiryForm({
  action,
  formToken,
  focusOnMount,
  onWriteAnother,
}: Readonly<{
  action: FormAction;
  formToken: string;
  focusOnMount: boolean;
  onWriteAnother: () => void;
}>) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  const statusRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [complete, setComplete] = useState<Record<string, boolean>>({});
  const [subject, setSubject] = useState("");
  const [messageLength, setMessageLength] = useState(0);

  // Reads completion straight from the inputs, so restored values count.
  const measure = () => {
    const form = formRef.current;
    if (!form) return;
    const next: Record<string, boolean> = {};
    for (const element of form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >("input[name], textarea[name]")) {
      next[element.name] =
        element.value.trim() !== "" && element.checkValidity();
    }
    setComplete(next);
    setSubject(
      form.querySelector<HTMLInputElement>("#contact-subject")?.value ?? "",
    );
    setMessageLength(
      form.querySelector<HTMLTextAreaElement>("#contact-message")?.value
        .length ?? 0,
    );
  };

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(measure);
    if (focusOnMount) formRef.current?.querySelector("input")?.focus();
    return () => window.cancelAnimationFrame(animationFrame);
    // Measure browser-restored values once; later changes arrive through onInput.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="site-form__seal" aria-hidden="true">
          <SunRays className="site-form__seal-rays" />
          <svg className="site-form__seal-mark" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="22" pathLength={1} />
            <path d="M22 33l7 7 14-15" pathLength={1} />
          </svg>
        </div>
        <h3>Thank you</h3>
        <p>{state.message}</p>
        <button
          type="button"
          className="site-button site-button--ghost"
          onClick={onWriteAnother}
        >
          Write another message
        </button>
      </div>
    );
  }

  const errors = (field: string) =>
    state.status === "error" ? (state.fieldErrors?.[field] ?? []) : [];
  const value = (field: string) =>
    state.status === "error" ? (state.values?.[field] ?? "") : "";
  const done = REQUIRED.filter((field) => complete[field]).length;

  const chooseTopic = (topic: string) => {
    const input =
      formRef.current?.querySelector<HTMLInputElement>("#contact-subject");
    if (!input) return;
    input.value = topic;
    measure();
  };

  // A soft light follows the pointer across the card.
  const onPointerMove = (event: PointerEvent<HTMLFormElement>) => {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--spot-x",
      `${event.clientX - box.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--spot-y",
      `${event.clientY - box.top}px`,
    );
  };

  return (
    <form
      ref={formRef}
      className="site-form"
      action={formAction}
      noValidate
      aria-busy={pending || undefined}
      data-ready={done === REQUIRED.length || undefined}
      onInput={measure}
      onPointerMove={onPointerMove}
    >
      <div className="site-form__head">
        <div>
          <p className="site-form__eyebrow">Private enquiry</p>
          <p className="site-form__title">How may we help?</p>
        </div>
        <p className="site-form__meter" aria-hidden="true">
          <span className="site-form__meter-label">
            {done === REQUIRED.length
              ? "Ready to send"
              : `${done} of ${REQUIRED.length} required`}
          </span>
          <span
            className="site-form__meter-track"
            style={{ "--progress": done / REQUIRED.length } as CSSProperties}
          />
        </p>
      </div>

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

      <div
        className="site-form__topics"
        role="group"
        aria-label="Choose a subject"
      >
        {TOPICS.map((topic) => (
          <button
            key={topic}
            type="button"
            className="site-form__topic"
            aria-pressed={subject === topic}
            onClick={() => chooseTopic(topic)}
          >
            {topic}
          </button>
        ))}
      </div>

      <div className="site-form__grid">
        {FIELDS.map((field, index) => {
          const id = `contact-${field.name}`;
          const fieldErrors = errors(field.name);
          return (
            <div
              className="site-field site-field--float"
              key={field.name}
              data-complete={complete[field.name] || undefined}
              style={{ "--i": index } as CSSProperties}
            >
              <input
                id={id}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                maxLength={field.maxLength}
                required={field.required}
                placeholder=" "
                defaultValue={value(field.name)}
                aria-invalid={fieldErrors.length > 0 || undefined}
                aria-describedby={
                  fieldErrors.length > 0 ? `${id}-error` : undefined
                }
              />
              <label htmlFor={id}>
                {field.label}
                {field.required ? null : (
                  <span className="site-field__optional"> (optional)</span>
                )}
              </label>
              <FieldDecor />
              {fieldErrors.length > 0 ? (
                <p className="site-field__error" id={`${id}-error`}>
                  {fieldErrors.join(" ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div
        className="site-field site-field--float site-field--message"
        data-complete={complete.message || undefined}
        style={{ "--i": FIELDS.length } as CSSProperties}
      >
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          maxLength={MESSAGE_MAX}
          required
          placeholder=" "
          defaultValue={value("message")}
          aria-invalid={errors("message").length > 0 || undefined}
          aria-describedby={
            errors("message").length > 0 ? "contact-message-error" : undefined
          }
        />
        <label htmlFor="contact-message">Message</label>
        <FieldDecor />
        <span className="site-field__count" aria-hidden="true">
          {messageLength.toLocaleString("en-US")} /{" "}
          {MESSAGE_MAX.toLocaleString("en-US")}
        </span>
        {errors("message").length > 0 ? (
          <p className="site-field__error" id="contact-message-error">
            {errors("message").join(" ")}
          </p>
        ) : null}
      </div>

      <div className="site-form__footer">
        <p className="site-form__note">
          We use your details only to reply to this message.
        </p>
        <button
          type="submit"
          className="site-button site-button--submit"
          disabled={pending}
          data-pending={pending || undefined}
        >
          {pending ? (
            <span className="site-button__spinner" aria-hidden="true" />
          ) : null}
          {pending ? "Sending…" : "Send message"}
          {pending ? null : <Icon name="arrow" />}
        </button>
      </div>
    </form>
  );
}

/** The focus rule and the completion tick drawn beside each field. */
function FieldDecor() {
  return (
    <>
      <span className="site-field__line" aria-hidden="true" />
      <svg className="site-field__tick" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
      </svg>
    </>
  );
}
