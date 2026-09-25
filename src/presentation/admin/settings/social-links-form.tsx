"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  MAX_SOCIAL_LINKS,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  type SocialPlatform,
} from "@/domain/settings/site-settings";
import {
  ErrorSummary,
  FieldShell,
  FormActions,
  SubmitButton,
} from "@/presentation/admin/ui/form";
import {
  fieldErrorsFor,
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";

export type SocialLinkRow = Readonly<{
  platform: SocialPlatform | "";
  label: string;
  url: string;
  isVisible: boolean;
}>;

type KeyedRow = SocialLinkRow & Readonly<{ key: number }>;

const COLUMN_LABELS = { platform: "Platform", label: "Label", url: "Link" };

type SocialLinksFormProps = Readonly<{
  action: FormAction;
  links: readonly SocialLinkRow[];
  version: string;
}>;

export function SocialLinksForm({
  action,
  links,
  version,
}: SocialLinksFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const nextKey = useRef(links.length);
  const [rows, setRows] = useState<readonly KeyedRow[]>(() =>
    links.map((link, key) => ({ ...link, key })),
  );
  const [announcement, setAnnouncement] = useState("");
  const focusAfterRender = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "success") toast(state.message);
  }, [state, toast]);

  useEffect(() => {
    if (!focusAfterRender.current) return;
    document.getElementById(focusAfterRender.current)?.focus();
    focusAfterRender.current = null;
  });

  const nameOf = (row: SocialLinkRow, index: number) =>
    row.platform ? SOCIAL_PLATFORM_LABELS[row.platform] : `Link ${index + 1}`;

  function update(key: number, patch: Partial<SocialLinkRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function add() {
    const used = new Set(rows.map((row) => row.platform));
    const platform = SOCIAL_PLATFORMS.find((value) => !used.has(value)) ?? "";
    const key = nextKey.current++;
    setRows((current) => [
      ...current,
      {
        key,
        platform,
        label: platform ? SOCIAL_PLATFORM_LABELS[platform] : "",
        url: "",
        isVisible: true,
      },
    ]);
    focusAfterRender.current = `social-${rows.length}-platform`;
    setAnnouncement(`Link ${rows.length + 1} added.`);
  }

  function remove(index: number) {
    const removed = rows[index]!;
    setRows((current) => current.filter((_, position) => position !== index));
    focusAfterRender.current =
      rows.length > 1
        ? `social-${Math.min(index, rows.length - 2)}-platform`
        : "social-add";
    setAnnouncement(
      `${nameOf(removed, index)} removed. Save social links to apply.`,
    );
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    const moved = rows[index]!;
    setRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    focusAfterRender.current = `social-${target}-${offset < 0 ? "up" : "down"}`;
    if (target === 0 || target === rows.length - 1) {
      focusAfterRender.current = `social-${target}-platform`;
    }
    setAnnouncement(
      `${nameOf(moved, index)} moved to position ${target + 1} of ${rows.length}.`,
    );
  }

  const summary =
    state.status === "error"
      ? Object.entries(state.fieldErrors ?? {}).flatMap(([path, messages]) => {
          const [index, column] = path.split(".");
          const row = Number(index);
          const fieldId =
            column && Number.isInteger(row)
              ? `social-${row}-${column}`
              : "social-add";
          const prefix =
            column && Number.isInteger(row)
              ? `Link ${row + 1} ${COLUMN_LABELS[column as keyof typeof COLUMN_LABELS]?.toLowerCase() ?? column}: `
              : "";
          return messages.map((message) => ({
            fieldId,
            message: `${prefix}${message}`,
          }));
        })
      : [];

  const serialized = JSON.stringify(
    rows.map(({ platform, label, url, isVisible }) => ({
      platform,
      label,
      url,
      isVisible,
    })),
  );

  return (
    <form className="admin-form" action={formAction} noValidate>
      {state.status === "error" ? (
        <ErrorSummary
          title={state.message}
          errors={summary}
          submission={state}
        />
      ) : null}
      <input type="hidden" name="expectedUpdatedAt" value={version} />
      <input type="hidden" name="links" value={serialized} />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {rows.length === 0 ? (
        <p className="admin-muted">
          No social links yet. Links you add appear in the website footer in
          this order.
        </p>
      ) : (
        <ol className="admin-repeatable">
          {rows.map((row, index) => {
            const id = (column: string) => `social-${index}-${column}`;
            const errors = (column: string) =>
              fieldErrorsFor(state, `${index}.${column}`);
            const name = nameOf(row, index);
            return (
              <li key={row.key} className="admin-repeatable__item">
                <fieldset className="admin-fieldset admin-fieldset--row">
                  <legend>
                    {index + 1}. {name}
                  </legend>
                  <div className="admin-form-grid">
                    <FieldShell
                      id={id("platform")}
                      label="Platform"
                      errors={errors("platform")}
                    >
                      {(describedBy, invalid) => (
                        <select
                          id={id("platform")}
                          value={row.platform}
                          aria-invalid={invalid || undefined}
                          aria-describedby={describedBy}
                          onChange={(event) => {
                            const platform = event.target.value as
                              | SocialPlatform
                              | "";
                            const previousDefault = row.platform
                              ? SOCIAL_PLATFORM_LABELS[row.platform]
                              : "";
                            update(row.key, {
                              platform,
                              // Keep a custom label; follow the default one.
                              ...(row.label === previousDefault && platform
                                ? { label: SOCIAL_PLATFORM_LABELS[platform] }
                                : {}),
                            });
                          }}
                        >
                          <option value="">Choose…</option>
                          {SOCIAL_PLATFORMS.map((platform) => (
                            <option key={platform} value={platform}>
                              {SOCIAL_PLATFORM_LABELS[platform]}
                            </option>
                          ))}
                        </select>
                      )}
                    </FieldShell>
                    <FieldShell
                      id={id("label")}
                      label="Label"
                      hint="Read aloud by screen readers, e.g. “Rivana on Instagram”."
                      errors={errors("label")}
                    >
                      {(describedBy, invalid) => (
                        <input
                          id={id("label")}
                          value={row.label}
                          maxLength={80}
                          aria-invalid={invalid || undefined}
                          aria-describedby={describedBy}
                          onChange={(event) =>
                            update(row.key, { label: event.target.value })
                          }
                        />
                      )}
                    </FieldShell>
                  </div>
                  <FieldShell
                    id={id("url")}
                    label="Link"
                    errors={errors("url")}
                  >
                    {(describedBy, invalid) => (
                      <input
                        id={id("url")}
                        type="url"
                        inputMode="url"
                        spellCheck={false}
                        placeholder="https://"
                        value={row.url}
                        maxLength={2048}
                        aria-invalid={invalid || undefined}
                        aria-describedby={describedBy}
                        onChange={(event) =>
                          update(row.key, { url: event.target.value })
                        }
                      />
                    )}
                  </FieldShell>
                  <div className="admin-repeatable__controls">
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        id={id("visible")}
                        checked={row.isVisible}
                        onChange={(event) =>
                          update(row.key, { isVisible: event.target.checked })
                        }
                      />
                      Show on website
                    </label>
                    <div className="admin-repeatable__buttons">
                      <button
                        type="button"
                        id={id("up")}
                        aria-label={`Move up: ${name}`}
                        className="admin-button admin-button--quiet"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        id={id("down")}
                        aria-label={`Move down: ${name}`}
                        className="admin-button admin-button--quiet"
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        className="admin-button admin-button--danger-quiet"
                        aria-label={`Remove: ${name}`}
                        onClick={() => remove(index)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}

      <button
        type="button"
        id="social-add"
        className="admin-button admin-button--secondary"
        onClick={add}
        disabled={rows.length >= MAX_SOCIAL_LINKS}
      >
        Add social link
      </button>

      <FormActions
        meta="Changes apply to the website only after you save."
        primary={
          <SubmitButton pendingLabel="Saving…">Save social links</SubmitButton>
        }
      />
    </form>
  );
}
