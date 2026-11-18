"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  ErrorSummary,
  FieldShell,
  FormActions,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/presentation/admin/ui/form";
import {
  fieldErrorsFor,
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";
import {
  button,
  check,
  checkInput,
  control,
  fieldsetFlat,
  form,
  formGrid,
  legend,
  muted,
} from "@/presentation/admin/ui/classes";

import type { WhatsAppCatalog } from "./catalog";
import {
  categoryLabel,
  languageLabel,
  purposeLabel,
  variableLabel,
} from "./labels";

export type TemplateValues = Readonly<{
  id: string | null;
  purpose: string;
  language: string;
  providerName: string;
  category: string;
  variables: readonly string[];
  previewText: string;
  active: boolean;
}>;

type TemplateFormProps = Readonly<{
  action: FormAction;
  catalog: WhatsAppCatalog;
  /** The template being edited, or null to add a new one. */
  template: TemplateValues | null;
  /** Where "Cancel" goes when editing. */
  cancelHref: Route;
}>;

const LABELS: Readonly<Record<string, string>> = {
  purpose: "Message purpose",
  language: "Language",
  providerName: "Template name in Meta",
  category: "Category",
  variables: "Variables",
  previewText: "Preview text",
  active: "Active",
};

const fieldId = (name: string) => `wa-template-${name}`;

/** The category Meta requires for a purpose, when the rules fix one. */
function categoryFor(purpose: string, current: string) {
  if (purpose === "VERIFICATION_CODE") return "AUTHENTICATION";
  if (purpose === "MARKETING") return "MARKETING";
  if (current === "MARKETING") return "UTILITY";
  if (current === "AUTHENTICATION" && purpose !== "TEST") return "UTILITY";
  return current;
}

const BLANK: TemplateValues = {
  id: null,
  purpose: "BOOKING_CONFIRMED",
  language: "en",
  providerName: "",
  category: "UTILITY",
  variables: [],
  previewText: "",
  active: true,
};

export function WhatsAppTemplateForm({
  action,
  catalog,
  template,
  cancelHref,
}: TemplateFormProps) {
  const initial = template ?? BLANK;
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const [purpose, setPurpose] = useState(initial.purpose);
  const [language, setLanguage] = useState(initial.language);
  const [category, setCategory] = useState(initial.category);
  const [active, setActive] = useState(initial.active);
  const [variables, setVariables] = useState<readonly string[]>(
    initial.variables,
  );
  const [announcement, setAnnouncement] = useState("");
  const focusAfterRender = useRef<readonly string[] | null>(null);
  // Bumped after every result. React resets the form after an action, which
  // puts the visible selects and checkbox back to their first values; a new
  // key remounts them from state (see the layout effect below). The values that are submitted travel in
  // hidden inputs, so they never depend on those controls.
  const [syncKey, setSyncKey] = useState(0);
  const editing = initial.id !== null;

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  // Adding: React clears the typed fields after a save; clear the rest too.
  // Done while rendering (derived state), not in an effect.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success" && !editing) {
      setPurpose(BLANK.purpose);
      setLanguage(BLANK.language);
      setCategory(BLANK.category);
      setActive(BLANK.active);
      setVariables([]);
    }
  }

  // React resets the form in the commit that delivers a result, so the
  // visible controls are re-synced right after it (a microtask runs before
  // the browser paints, so nothing flickers).
  useLayoutEffect(() => {
    if (state === idleFormState) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setSyncKey((key) => key + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    if (!focusAfterRender.current) return;
    // The first candidate that is not disabled; a disabled control cannot
    // take focus, and focus would fall to the page.
    for (const id of focusAfterRender.current) {
      const element = document.getElementById(id) as
        | (HTMLElement & { disabled?: boolean })
        | null;
      if (element && !element.disabled) {
        element.focus();
        break;
      }
    }
    focusAfterRender.current = null;
  });

  const allowed = catalog.variablesByPurpose[purpose] ?? [];
  const addable = allowed.filter((key) => !variables.includes(key));

  function changePurpose(next: string) {
    const nextAllowed = catalog.variablesByPurpose[next] ?? [];
    const kept = variables.filter((key) => nextAllowed.includes(key));
    setPurpose(next);
    setCategory(categoryFor(next, category));
    // A verification code template carries only the code.
    setVariables(
      next === "VERIFICATION_CODE" && !kept.includes("code") ? ["code"] : kept,
    );
  }

  function addVariable(key: string) {
    if (!key) return;
    setVariables((current) => [...current, key]);
    setAnnouncement(
      `${variableLabel(key)} added as variable ${variables.length + 1}.`,
    );
    const added = `${fieldId("variable")}-${variables.length}`;
    focusAfterRender.current = [
      fieldId("add"),
      `${added}-up`,
      `${added}-remove`,
    ];
  }

  function removeVariable(index: number) {
    const removed = variables[index]!;
    setVariables((current) => current.filter((_, i) => i !== index));
    setAnnouncement(`${variableLabel(removed)} removed.`);
    focusAfterRender.current = [fieldId("add"), fieldId("previewText")];
  }

  function moveVariable(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= variables.length) return;
    const moved = variables[index]!;
    setVariables((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    const row = `${fieldId("variable")}-${target}`;
    focusAfterRender.current =
      offset < 0
        ? [`${row}-up`, `${row}-down`, `${row}-remove`]
        : [`${row}-down`, `${row}-up`, `${row}-remove`];
    setAnnouncement(
      `${variableLabel(moved)} moved to position ${target + 1} of ${variables.length}.`,
    );
  }

  // After a failed save React resets the uncontrolled fields; restore them.
  const typed = (name: "providerName" | "previewText") =>
    state.status === "error" && state.values
      ? (state.values[name] ?? "")
      : initial[name];

  const summary =
    state.status === "error"
      ? Object.entries(state.fieldErrors ?? {}).flatMap(([name, messages]) =>
          messages.map((message) => ({
            fieldId: name in LABELS ? fieldId(name) : fieldId("purpose"),
            message: `${LABELS[name] ?? "Template"}: ${message}`,
          })),
        )
      : [];

  return (
    <form className={form} action={formAction} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={summary}
          submission={state}
        />
      ) : null}
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="language" value={language} />
      <input type="hidden" name="category" value={category} />
      {active ? <input type="hidden" name="active" value="on" /> : null}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className={formGrid}>
        <FieldShell
          id={fieldId("purpose")}
          label={LABELS.purpose!}
          errors={fieldErrorsFor(state, "purpose")}
        >
          {(describedBy, invalid) => (
            <select
              key={`purpose-${syncKey}`}
              id={fieldId("purpose")}
              className={control}
              value={purpose}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(event) => changePurpose(event.target.value)}
            >
              {catalog.purposes.map((value) => (
                <option key={value} value={value}>
                  {purposeLabel(value)}
                </option>
              ))}
            </select>
          )}
        </FieldShell>
        <FieldShell
          id={fieldId("language")}
          label={LABELS.language!}
          hint="Messages are sent in English for now."
          errors={fieldErrorsFor(state, "language")}
        >
          {(describedBy, invalid) => (
            <select
              key={`language-${syncKey}`}
              id={fieldId("language")}
              className={control}
              value={language}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {catalog.languages.map((value) => (
                <option key={value} value={value}>
                  {languageLabel(value)}
                </option>
              ))}
            </select>
          )}
        </FieldShell>
      </div>

      <div className={formGrid}>
        <TextField
          id={fieldId("providerName")}
          name="providerName"
          label={LABELS.providerName!}
          hint="Exactly as approved in Meta: lowercase letters, digits, and underscores."
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          defaultValue={typed("providerName")}
          errors={fieldErrorsFor(state, "providerName")}
        />
        <FieldShell
          id={fieldId("category")}
          label={LABELS.category!}
          errors={fieldErrorsFor(state, "category")}
        >
          {(describedBy, invalid) => (
            <select
              key={`category-${syncKey}`}
              id={fieldId("category")}
              className={control}
              value={category}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(event) => setCategory(event.target.value)}
            >
              {catalog.categories.map((value) => (
                <option key={value} value={value}>
                  {categoryLabel(value)}
                </option>
              ))}
            </select>
          )}
        </FieldShell>
      </div>

      <fieldset className={fieldsetFlat}>
        <legend className={legend}>Variables, in Meta&apos;s order</legend>
        <p className={muted}>
          The first variable fills {"{{1}}"}, the second {"{{2}}"}, and so on.
          Only variables this purpose can fill are offered.
        </p>
        {fieldErrorsFor(state, "variables").length > 0 ? (
          <ul
            className="m-0 pl-5 text-[0.875rem] font-medium text-danger"
            id={fieldId("variables")}
            tabIndex={-1}
          >
            {fieldErrorsFor(state, "variables").map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        {variables.length === 0 ? (
          <p className={muted}>
            No variables. The message has fixed text only.
          </p>
        ) : (
          <ol className="grid gap-2">
            {variables.map((key, index) => (
              <li
                key={key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-neutral-300 bg-admin-canvas px-4 py-2"
              >
                <input type="hidden" name="variables" value={key} />
                <span>
                  <strong>{`{{${index + 1}}}`}</strong> {variableLabel(key)}
                </span>
                <span className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    id={`${fieldId("variable")}-${index}-up`}
                    className={button("quiet")}
                    aria-label={`Move up: ${variableLabel(key)}`}
                    disabled={index === 0}
                    onClick={() => moveVariable(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    id={`${fieldId("variable")}-${index}-down`}
                    className={button("quiet")}
                    aria-label={`Move down: ${variableLabel(key)}`}
                    disabled={index === variables.length - 1}
                    onClick={() => moveVariable(index, 1)}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    id={`${fieldId("variable")}-${index}-remove`}
                    className={button("danger-quiet")}
                    aria-label={`Remove: ${variableLabel(key)}`}
                    onClick={() => removeVariable(index)}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <FieldShell id={fieldId("add")} label="Add a variable">
            {(describedBy) => (
              <select
                id={fieldId("add")}
                className={control}
                aria-describedby={
                  [
                    describedBy,
                    fieldErrorsFor(state, "variables").length > 0
                      ? fieldId("variables")
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                value=""
                disabled={addable.length === 0}
                onChange={(event) => addVariable(event.target.value)}
              >
                <option value="">
                  {addable.length === 0 ? "No more variables" : "Choose…"}
                </option>
                {addable.map((key) => (
                  <option key={key} value={key}>
                    {variableLabel(key)}
                  </option>
                ))}
              </select>
            )}
          </FieldShell>
        </div>
      </fieldset>

      <TextAreaField
        id={fieldId("previewText")}
        name="previewText"
        label={LABELS.previewText!}
        rows={4}
        hint="The approved wording with {{1}}, {{2}} placeholders. Shown to staff only."
        maxLength={1024}
        defaultValue={typed("previewText")}
        errors={fieldErrorsFor(state, "previewText")}
      />

      <div className="grid gap-2">
        {fieldErrorsFor(state, "active").length > 0 ? (
          <ul
            className="m-0 pl-5 text-[0.875rem] font-medium text-danger"
            id={fieldId("active-errors")}
          >
            {fieldErrorsFor(state, "active").map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        <label className={check}>
          <input
            key={`active-${syncKey}`}
            id={fieldId("active")}
            type="checkbox"
            className={checkInput}
            checked={active}
            aria-invalid={
              fieldErrorsFor(state, "active").length > 0 || undefined
            }
            aria-describedby={
              fieldErrorsFor(state, "active").length > 0
                ? `${fieldId("active-errors")} ${fieldId("active-hint")}`
                : fieldId("active-hint")
            }
            onChange={(event) => setActive(event.target.checked)}
          />
          Active
        </label>
        <p className={muted} id={fieldId("active-hint")}>
          Only one template can be active for a purpose and language, except
          marketing. Turn it off to stop using it; templates are never deleted.
        </p>
      </div>

      <FormActions
        secondary={
          editing ? (
            <Link href={cancelHref} className={button("quiet")}>
              Cancel
            </Link>
          ) : null
        }
        primary={
          <SubmitButton pendingLabel="Saving…">
            {editing ? "Save template" : "Add template"}
          </SubmitButton>
        }
      />
    </form>
  );
}
