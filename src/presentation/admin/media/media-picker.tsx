"use client";

import { useId, useMemo, useRef, useState } from "react";

import type { MediaOption } from "@/application/ports/repositories";
import { mediaUrl } from "@/presentation/admin/media/media-url";

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
        className="admin-button admin-button--secondary"
        aria-haspopup="dialog"
        onClick={open}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="admin-dialog admin-picker"
        aria-labelledby={titleId}
        onClose={() => triggerRef.current?.focus()}
      >
        <h2 id={titleId}>{title}</h2>
        <div className="admin-field">
          <label htmlFor={`${name}-search`}>
            Search by description or file name
          </label>
          <input
            ref={searchRef}
            id={`${name}-search`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {visible.length === 0 ? (
          <p className="admin-muted">
            {options.length === 0
              ? "The media library has no ready images yet. Upload images in Media first."
              : "No images match."}
          </p>
        ) : (
          <fieldset className="admin-picker__grid">
            <legend className="sr-only">{title}</legend>
            {visible.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`admin-picker__option${checked ? " admin-picker__option--checked" : ""}`}
                >
                  <input
                    type={multiple ? "checkbox" : "radio"}
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
                  />
                  <span className="admin-picker__caption">
                    {option.altText || "No alt text"}
                    <span className="admin-picker__file">
                      {option.originalFilename}
                    </span>
                    {option.rightsConfirmed ? null : (
                      <span className="admin-picker__warning">
                        Rights not confirmed
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <div className="admin-dialog__actions">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="admin-button"
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
