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
import { button } from "@/presentation/site/classes";

const CARD_SHADOW =
  "shadow-[0_40px_80px_-24px_rgb(10_4_8/0.5),0_0_0_1px_rgb(219_175_113/0.3)]";
/** An inset gold frame, like a letter card. */
const LETTER_FRAME =
  "after:pointer-events-none after:absolute after:inset-2.5 after:border after:border-[rgb(219_175_113/0.45)] after:content-['']";
const FOCUS_RING =
  "focus:[outline:3px_solid_var(--color-focus)] focus:[outline-offset:3px]";

// Floating-label fields: control, label, focus rule, tick, and counter share
// one grid cell; errors sit underneath. Fields rise in as the card appears.
const FIELD =
  "group/field grid grid-cols-[minmax(0,1fr)] content-start gap-0 [transition:opacity_700ms_var(--ease-out-soft)_calc(200ms+var(--i,0)*70ms),transform_700ms_var(--ease-out-soft)_calc(200ms+var(--i,0)*70ms)] reveal-hidden:opacity-0 reveal-hidden:[transform:translateY(1.25rem)] reveal-hidden:[transition:none]";
const CONTROL_BASE =
  "peer [grid-area:1/1] w-full min-w-0 rounded-none border-0 border-b border-control-border bg-transparent pt-[1.6rem] pr-8 pl-0 text-neutral-950 [transition:border-color_var(--motion-fast)_ease,background-color_var(--motion-fast)_ease] hover:border-b-neutral-800 focus-visible:border-b-transparent focus-visible:bg-transparent focus-visible:[outline:none] aria-invalid:shadow-[inset_0_-1px_0_var(--color-danger)] aria-invalid:not-hover:not-focus-visible:border-b-danger";
const INPUT = `${CONTROL_BASE} min-h-15 pb-[0.55rem]`;
const TEXTAREA = `${CONTROL_BASE} max-h-96 min-h-36 resize-y pb-8 [field-sizing:content]`;
// The label lifts once the field has focus, a value, or autofill.
const LABEL =
  "pointer-events-none [grid-area:1/1] mt-[1.35rem] origin-top-left self-start justify-self-start text-[0.75rem] font-medium tracking-[0.16em] text-neutral-600 uppercase [transition:transform_360ms_var(--ease-out-soft),color_var(--motion-surface)_ease] peer-focus:text-plum-700 peer-focus:[transform:translateY(-1.1rem)_scale(0.84)] peer-[:not(:placeholder-shown)]:text-plum-700 peer-[:not(:placeholder-shown)]:[transform:translateY(-1.1rem)_scale(0.84)] peer-autofill:text-plum-700 peer-autofill:[transform:translateY(-1.1rem)_scale(0.84)]";
const FIELD_ERROR =
  "m-0 mt-2 animate-[site-rise_400ms_var(--ease-out-soft)_both] text-[0.875rem] font-medium text-danger";
const OPTIONAL = "font-normal tracking-normal text-neutral-600 normal-case";

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
        data-form-success=""
        className={`relative grid justify-items-center gap-4 border-l-0 bg-surface px-[clamp(1.5rem,4vw,3rem)] py-[clamp(2.5rem,6vw,4.5rem)] text-center text-neutral-800 ${CARD_SHADOW} ${LETTER_FRAME} ${FOCUS_RING}`}
      >
        <div
          className="relative grid aspect-square w-36 place-items-center"
          aria-hidden="true"
        >
          <SunRays
            className="absolute inset-0 size-full text-gold-400"
            motion="seal"
          />
          <svg
            className="relative size-20 fill-none [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.5]"
            viewBox="0 0 64 64"
          >
            <circle
              cx="32"
              cy="32"
              r="22"
              pathLength={1}
              className="animate-[site-draw-path_900ms_var(--ease-out-soft)_150ms_both] stroke-plum-700 [stroke-dasharray:1]"
            />
            <path
              d="M22 33l7 7 14-15"
              pathLength={1}
              className="animate-[site-draw-path_600ms_var(--ease-out-soft)_850ms_both] stroke-gold-600 [stroke-dasharray:1]"
            />
          </svg>
        </div>
        <h3 className="m-0 animate-[site-rise_800ms_var(--ease-out-soft)_650ms_both] font-display text-display-md font-normal text-plum-800">
          Thank you
        </h3>
        <p className="m-0 max-w-[28rem] animate-[site-rise_800ms_var(--ease-out-soft)_780ms_both]">
          {state.message}
        </p>
        <button
          type="button"
          className={button(
            "ghost",
            "mt-4 animate-[site-rise_800ms_var(--ease-out-soft)_900ms_both]",
          )}
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
      data-contact-form=""
      className={`group/form relative isolate grid gap-8 overflow-hidden bg-surface p-[clamp(1.75rem,4.5vw,3.5rem)] text-neutral-950 [--spot-x:50%] [--spot-y:0%] ${CARD_SHADOW} before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:bg-[radial-gradient(30rem_circle_at_var(--spot-x)_var(--spot-y),rgb(219_175_113/0.16),transparent_65%)] before:opacity-0 before:[transition:opacity_500ms_ease] before:content-[''] fine-pointer:hover:before:opacity-100 ${LETTER_FRAME}`}
      action={formAction}
      noValidate
      aria-busy={pending || undefined}
      data-ready={done === REQUIRED.length || undefined}
      onInput={measure}
      onPointerMove={onPointerMove}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-neutral-300 pb-6">
        <div>
          <p className="mt-0 mb-2 text-[0.6875rem] font-medium tracking-[0.28em] text-gold-600 uppercase">
            Private enquiry
          </p>
          <p className="m-0 font-display text-heading-lg leading-[1.1] text-plum-900">
            How may we help?
          </p>
        </div>
        <p className="m-0 grid justify-items-end gap-2" aria-hidden="true">
          <span className="text-[0.6875rem] font-medium tracking-[0.2em] text-neutral-600 uppercase tabular-nums [transition:color_var(--motion-surface)_ease] group-data-ready/form:text-gold-600">
            {done === REQUIRED.length
              ? "Ready to send"
              : `${done} of ${REQUIRED.length} required`}
          </span>
          <span
            className="relative block h-0.5 w-36 overflow-hidden bg-neutral-300 after:absolute after:inset-0 after:origin-left after:bg-[linear-gradient(90deg,var(--color-plum-700),var(--color-gold-400))] after:[transform:scaleX(var(--progress,0))] after:[transition:transform_700ms_var(--ease-out-soft)] after:content-['']"
            style={{ "--progress": done / REQUIRED.length } as CSSProperties}
          />
        </p>
      </div>

      {state.status === "error" ? (
        <div
          ref={statusRef}
          tabIndex={-1}
          role="alert"
          data-form-error=""
          className={`animate-[site-rise_450ms_var(--ease-out-soft)_both] border-l-3 border-l-danger bg-danger-soft px-5 py-4 text-danger ${FOCUS_RING}`}
        >
          {state.message}
        </div>
      ) : null}
      <input type="hidden" name="formToken" value={formToken} />
      {/* Hidden from people; bots that fill it are ignored. */}
      <div
        data-form-trap=""
        className="absolute -left-[10000px] size-px overflow-hidden"
        aria-hidden="true"
      >
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
        className="-mb-2 flex flex-wrap gap-2"
        role="group"
        aria-label="Choose a subject"
      >
        {TOPICS.map((topic) => (
          <button
            key={topic}
            type="button"
            className="min-h-11 cursor-pointer border border-neutral-300 bg-transparent px-4 py-2 text-[0.8125rem] text-neutral-800 [transition:background-color_var(--motion-surface)_ease,border-color_var(--motion-surface)_ease,color_var(--motion-surface)_ease,transform_var(--motion-fast)_ease] hover:border-plum-700 hover:text-plum-800 active:[transform:scale(0.96)] aria-pressed:border-plum-800 aria-pressed:bg-plum-800 aria-pressed:text-surface"
            aria-pressed={subject === topic}
            onClick={() => chooseTopic(topic)}
          >
            {topic}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-x-8 gap-y-6">
        {FIELDS.map((field, index) => {
          const id = `contact-${field.name}`;
          const fieldErrors = errors(field.name);
          return (
            <div
              className={FIELD}
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
                className={INPUT}
                defaultValue={value(field.name)}
                aria-invalid={fieldErrors.length > 0 || undefined}
                aria-describedby={
                  fieldErrors.length > 0 ? `${id}-error` : undefined
                }
              />
              <label htmlFor={id} className={LABEL}>
                {field.label}
                {field.required ? null : (
                  <span className={OPTIONAL}> (optional)</span>
                )}
              </label>
              <FieldDecor />
              {fieldErrors.length > 0 ? (
                <p className={FIELD_ERROR} id={`${id}-error`}>
                  {fieldErrors.join(" ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div
        className={FIELD}
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
          className={TEXTAREA}
          defaultValue={value("message")}
          aria-invalid={errors("message").length > 0 || undefined}
          aria-describedby={
            errors("message").length > 0 ? "contact-message-error" : undefined
          }
        />
        <label htmlFor="contact-message" className={LABEL}>
          Message
        </label>
        <FieldDecor message />
        <span
          className="pointer-events-none [grid-area:1/1] mb-[0.65rem] self-end justify-self-end text-[0.75rem] text-neutral-600 tabular-nums"
          aria-hidden="true"
        >
          {messageLength.toLocaleString("en-US")} /{" "}
          {MESSAGE_MAX.toLocaleString("en-US")}
        </span>
        {errors("message").length > 0 ? (
          <p className={FIELD_ERROR} id="contact-message-error">
            {errors("message").join(" ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <p className="m-0 max-w-[22rem] text-[0.875rem] font-normal text-neutral-600">
          We use your details only to reply to this message.
        </p>
        <button
          type="submit"
          className={button(
            "primary",
            "group/submit relative overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(110deg,transparent_30%,rgb(255_255_255/0.24)_50%,transparent_70%)] after:[transform:translateX(-100%)] after:content-[''] can-hover:hover:after:[transform:translateX(100%)] can-hover:hover:after:[transition:transform_800ms_var(--ease-out-soft)] group-data-ready/form:not-disabled:shadow-[0_0_0_4px_rgb(219_175_113/0.4)] max-md:flex-[1_1_100%] max-md:justify-self-stretch",
          )}
          disabled={pending}
          data-pending={pending || undefined}
        >
          {pending ? (
            <span
              className="size-4 animate-[site-spin_0.8s_linear_infinite] rounded-[50%] border-[1.5px] border-current border-r-transparent"
              aria-hidden="true"
            />
          ) : null}
          {pending ? "Sending…" : "Send message"}
          {pending ? null : (
            <Icon
              name="arrow"
              className="size-[1.125rem] flex-none [transition:transform_350ms_var(--ease-out-soft)] can-hover:group-hover/submit:[transform:translateX(0.3rem)]"
            />
          )}
        </button>
      </div>
    </form>
  );
}

/** The focus rule and the completion tick drawn beside each field. */
function FieldDecor({ message = false }: Readonly<{ message?: boolean }>) {
  return (
    <>
      <span
        className="pointer-events-none [grid-area:1/1] h-0.5 origin-left self-end bg-[linear-gradient(90deg,var(--color-plum-700),var(--color-gold-400))] [transform:scaleX(0)] [transition:transform_550ms_var(--ease-out-soft)] group-focus-within/field:[transform:scaleX(1)]"
        aria-hidden="true"
      />
      <svg
        className={`pointer-events-none [grid-area:1/1] size-5 justify-self-end fill-none stroke-gold-600 stroke-2 [stroke-dasharray:1] [stroke-dashoffset:1] [stroke-linecap:round] [stroke-linejoin:round] [transition:stroke-dashoffset_500ms_var(--ease-out-soft)] group-data-complete/field:[stroke-dashoffset:0] ${message ? "mt-6 self-start" : "mt-[0.9rem] self-center"}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
      </svg>
    </>
  );
}
