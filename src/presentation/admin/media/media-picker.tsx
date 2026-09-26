"use client";

import { useId, useMemo, useRef, useState } from "react";

import type { MediaOption } from "@/application/ports/repositories";
import { mediaUrl } from "@/presentation/admin/media/media-url";
import {
  button,
  control,
  dialog,
  dialogActions,
  field,
  fieldLabel,
  muted,
} from "@/presentation/admin/ui/classes";

const pickerDialog = dialog.replace(
  "w-[min(30rem,calc(100vw-2rem))]",
  "max-h-[min(48rem,calc(100vh-2rem))] w-[min(52rem,calc(100vw-2rem))]",
);

type MediaPickerProps = Readonly<{
  options: readonly MediaOption[];
  /** Text of the button that opens the picker. */
  triggerLabel: string;
  title: string;
  multiple: boolean;
  /** Ids already chosen elsewhere that cannot be picked again. */
  exclude?: readonly string[];
  onPick: (ids: readonly string[]) => void;
}>;

// A modal picker built on <dialog>. Choices are native radio buttons or
// checkboxes, so arrow keys, Space, and Tab work as users expect; search
// filters by alt text or file name.
export function MediaPicker({
  options,
  triggerLabel,
  title,
  multiple,
  exclude = [],
  onPick,
}: MediaPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const titleId = useId();
  const name = useId();

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("en");
    return options.filter(
      (option) =>
        !exclude.includes(option.id) &&
        (!needle ||
          option.altText.toLocaleLowerCase("en").includes(needle) ||
          option.originalFilename.toLocaleLowerCase("en").includes(needle)),
    );
  }, [options, exclude, search]);

  function open() {
    setSelected([]);
    setSearch("");
    dialogRef.current?.showModal();
    searchRef.current?.focus();
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) =>
      multiple
        ? checked
          ? [...current, id]
          : current.filter((item) => item !== id)
        : [id],
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={button("secondary")}
        aria-haspopup="dialog"
        onClick={open}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className={pickerDialog}
        aria-labelledby={titleId}
        onClose={() => triggerRef.current?.focus()}
      >
        <h2 id={titleId}>{title}</h2>
        <div className={field}>
          <label htmlFor={`${name}-search`} className={fieldLabel}>
            Search by description or file name
          </label>
          <input
            ref={searchRef}
            id={`${name}-search`}
            type="search"
            className={control}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {visible.length === 0 ? (
          <p className={muted}>
            {options.length === 0
              ? "The media library has no ready images yet. Upload images in Media first."
              : "No images match."}
          </p>
        ) : (
          <fieldset className="mt-4 grid max-h-[26rem] grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] gap-3 overflow-y-auto p-1">
            <legend className="visually-hidden">{title}</legend>
            {visible.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`relative grid cursor-pointer gap-1 rounded-panel border-2 p-2 focus-within:[outline:3px_solid_var(--color-focus)] focus-within:[outline-offset:2px] ${checked ? "border-plum-700 bg-plum-100" : "border-neutral-300"}`}
                >
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    className="absolute top-3 left-3 size-[1.125rem] accent-plum-700"
                    name={name}
                    value={option.id}
                    checked={checked}
                    onChange={(event) =>
                      toggle(option.id, event.target.checked)
                    }
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails are served as stored */}
                  <img
                    src={mediaUrl(option.storageKey)}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-control object-cover"
                  />
                  <span className="grid text-[0.8125rem] [overflow-wrap:anywhere]">
                    {option.altText || "No alt text"}
                    <span className="text-[0.75rem] text-neutral-600">
                      {option.originalFilename}
                    </span>
                    {option.rightsConfirmed ? null : (
                      <span className="text-[0.75rem] font-medium text-warning">
                        Rights not confirmed
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <div className={dialogActions}>
          <button
            type="button"
            className={button("secondary")}
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={button()}
            disabled={selected.length === 0}
            onClick={() => {
              onPick(selected);
              dialogRef.current?.close();
            }}
          >
            {multiple && selected.length > 1
              ? `Use ${selected.length} images`
              : "Use image"}
          </button>
        </div>
      </dialog>
    </>
  );
}
