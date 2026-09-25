"use client";

import { useEffect, useRef, useState } from "react";

import { FieldShell } from "@/presentation/admin/ui/form";

export type RepeatableField = Readonly<{
  key: string;
  label: string;
  maxLength: number;
  multiline?: boolean;
}>;

export type RepeatableRow = Readonly<Record<string, string>>;

type KeyedRow = Readonly<{ key: number; values: RepeatableRow }>;

type RepeatableFieldsProps = Readonly<{
  /** Prefix for element ids; row fields are `${idPrefix}-${index}-${key}`. */
  idPrefix: string;
  legend: string;
  /** Singular noun for buttons and announcements, e.g. "feature". */
  itemNoun: string;
  fields: readonly RepeatableField[];
  initialRows: readonly RepeatableRow[];
  max: number;
  min?: number;
  /** When set, the rows are also submitted as JSON under this name. */
  name?: string;
  onChange?: (rows: readonly RepeatableRow[]) => void;
  errorsFor?: (index: number, key: string) => readonly string[];
  emptyText?: string;
}>;

function blankRow(fields: readonly RepeatableField[]): RepeatableRow {
  return Object.fromEntries(fields.map((field) => [field.key, ""]));
}

// An ordered list editor: add, remove, and move rows with focus kept on a
// sensible control and every change announced to screen readers.
export function RepeatableFields({
  idPrefix,
  legend,
  itemNoun,
  fields,
  initialRows,
  max,
  min = 0,
  name,
  onChange,
  errorsFor = () => [],
  emptyText,
}: RepeatableFieldsProps) {
  const nextKey = useRef(initialRows.length);
  const [rows, setRows] = useState<readonly KeyedRow[]>(() =>
    initialRows.map((values, key) => ({ key, values })),
  );
  const [announcement, setAnnouncement] = useState("");
  const focusAfterRender = useRef<string | null>(null);
  const firstKey = fields[0]!.key;
  const idFor = (index: number, key: string) => `${idPrefix}-${index}-${key}`;

  useEffect(() => {
    if (!focusAfterRender.current) return;
    document.getElementById(focusAfterRender.current)?.focus();
    focusAfterRender.current = null;
  });

  function commit(next: readonly KeyedRow[]) {
    setRows(next);
    onChange?.(next.map((row) => row.values));
  }

  const nameOf = (row: KeyedRow, index: number) =>
    row.values[firstKey]?.trim() || `${itemNoun} ${index + 1}`;

  function add() {
    const key = nextKey.current++;
    commit([...rows, { key, values: blankRow(fields) }]);
    focusAfterRender.current = idFor(rows.length, firstKey);
    setAnnouncement(`${itemNoun} ${rows.length + 1} added.`);
  }

  function remove(index: number) {
    const removed = rows[index]!;
    commit(rows.filter((_, position) => position !== index));
    focusAfterRender.current =
      rows.length > 1
        ? idFor(Math.min(index, rows.length - 2), firstKey)
        : `${idPrefix}-add`;
    setAnnouncement(`${nameOf(removed, index)} removed.`);
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    const next = [...rows];
    [next[index], next[target]] = [next[target]!, next[index]!];
    commit(next);
    const atEdge = target === 0 || target === rows.length - 1;
    focusAfterRender.current = atEdge
      ? idFor(target, firstKey)
      : idFor(target, offset < 0 ? "up" : "down");
    setAnnouncement(
      `${nameOf(rows[index]!, index)} moved to position ${target + 1} of ${rows.length}.`,
    );
  }

  function update(index: number, key: string, value: string) {
    commit(
      rows.map((row, position) =>
        position === index
          ? { ...row, values: { ...row.values, [key]: value } }
          : row,
      ),
    );
  }

  return (
    <fieldset className="admin-fieldset">
      <legend>{legend}</legend>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={JSON.stringify(rows.map((row) => row.values))}
        />
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {rows.length === 0 ? (
        <p className="admin-muted">{emptyText ?? `No ${itemNoun}s yet.`}</p>
      ) : (
        <ol className="admin-repeatable">
          {rows.map((row, index) => {
            const label = nameOf(row, index);
            return (
              <li key={row.key} className="admin-repeatable__item">
                <div
                  className={
                    fields.length > 1
                      ? "admin-form-grid"
                      : "admin-repeatable__single"
                  }
                >
                  {fields.map((field) => {
                    const id = idFor(index, field.key);
                    return (
                      <FieldShell
                        key={field.key}
                        id={id}
                        label={`${field.label} ${index + 1}`}
                        errors={errorsFor(index, field.key)}
                      >
                        {(describedBy, invalid) => {
                          const common = {
                            id,
                            value: row.values[field.key] ?? "",
                            maxLength: field.maxLength,
                            "aria-invalid": invalid || undefined,
                            "aria-describedby": describedBy,
                          };
                          return field.multiline ? (
                            <textarea
                              {...common}
                              rows={2}
                              onChange={(event) =>
                                update(index, field.key, event.target.value)
                              }
                            />
                          ) : (
                            <input
                              {...common}
                              onChange={(event) =>
                                update(index, field.key, event.target.value)
                              }
                            />
                          );
                        }}
                      </FieldShell>
                    );
                  })}
                </div>
                <div className="admin-repeatable__buttons">
                  <button
                    type="button"
                    id={idFor(index, "up")}
                    className="admin-button admin-button--quiet"
                    aria-label={`Move up: ${label}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    id={idFor(index, "down")}
                    className="admin-button admin-button--quiet"
                    aria-label={`Move down: ${label}`}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-button--danger-quiet"
                    aria-label={`Remove: ${label}`}
                    disabled={rows.length <= min}
                    onClick={() => remove(index)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        id={`${idPrefix}-add`}
        className="admin-button admin-button--secondary"
        disabled={rows.length >= max}
        onClick={add}
      >
        Add {itemNoun}
      </button>
    </fieldset>
  );
}
