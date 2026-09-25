"use client";

import { useId, useState } from "react";

import type { MediaOption } from "@/application/ports/repositories";
import { MediaPicker } from "@/presentation/admin/media/media-picker";
import { mediaUrl } from "@/presentation/admin/media/media-url";

export type ChosenImage = Readonly<{
  mediaId: string;
  altOverride: string | null;
}>;

function Thumb({ option }: Readonly<{ option: MediaOption | undefined }>) {
  if (!option)
    return <span className="admin-thumb admin-thumb--missing">Missing</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnails are served as stored
    <img className="admin-thumb" src={mediaUrl(option.storageKey)} alt="" />
  );
}

function describe(option: MediaOption | undefined) {
  return option
    ? option.altText || option.originalFilename
    : "Image no longer available";
}

function AltOverride({
  id,
  value,
  onChange,
}: Readonly<{
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
}>) {
  return (
    <div className="admin-field">
      <label htmlFor={id}>
        Alt text here <span className="admin-field__optional">(optional)</span>
      </label>
      <p className="admin-field__hint" id={`${id}-hint`}>
        Only if this image means something different in this place. Otherwise
        the library’s alt text is used.
      </p>
      <input
        id={id}
        maxLength={300}
        value={value ?? ""}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </div>
  );
}

type SingleImageProps = Readonly<{
  label: string;
  hint?: string;
  options: readonly MediaOption[];
  value: ChosenImage | null;
  onChange: (value: ChosenImage | null) => void;
  /** Offer a contextual alt text for this use. */
  withAltOverride?: boolean;
}>;

export function SingleImage({
  label,
  hint,
  options,
  value,
  onChange,
  withAltOverride = false,
}: SingleImageProps) {
  const id = useId();
  const option = options.find((item) => item.id === value?.mediaId);
  return (
    <fieldset
      className="admin-fieldset admin-fieldset--nested"
      aria-describedby={hint ? `${id}-hint` : undefined}
    >
      <legend>{label}</legend>
      {hint ? (
        <p className="admin-fieldset__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {value ? (
        <div className="admin-image-choice">
          <Thumb option={option} />
          <span>{describe(option)}</span>
        </div>
      ) : (
        <p className="admin-muted">No image chosen.</p>
      )}
      <div className="admin-image-choice__actions">
        <MediaPicker
          options={options}
          multiple={false}
          triggerLabel={
            value
              ? `Change ${label.toLowerCase()}`
              : `Choose ${label.toLowerCase()}`
          }
          title={`Choose ${label.toLowerCase()}`}
          onPick={([mediaId]) =>
            mediaId &&
            onChange({ mediaId, altOverride: value?.altOverride ?? null })
          }
        />
        {value ? (
          <button
            type="button"
            className="admin-button admin-button--danger-quiet"
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={() => onChange(null)}
          >
            Remove
          </button>
        ) : null}
      </div>
      {value && withAltOverride ? (
        <AltOverride
          id={`${id}-alt`}
          value={value.altOverride}
          onChange={(altOverride) => onChange({ ...value, altOverride })}
        />
      ) : null}
    </fieldset>
  );
}

type ImageListProps = Readonly<{
  label: string;
  hint?: string;
  options: readonly MediaOption[];
  value: readonly ChosenImage[];
  onChange: (value: readonly ChosenImage[]) => void;
  /** Ids that cannot be added (e.g. the hero image). */
  exclude?: readonly string[];
}>;

/** An ordered list of images with move, remove, and per-use alt text. */
export function ImageList({
  label,
  hint,
  options,
  value,
  onChange,
  exclude = [],
}: ImageListProps) {
  const id = useId();
  const [announcement, setAnnouncement] = useState("");

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    const next = [...value];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
    setAnnouncement(
      `Image moved to position ${target + 1} of ${value.length}.`,
    );
    requestAnimationFrame(() => {
      const edge = target === 0 || target === value.length - 1;
      document
        .getElementById(
          `${id}-${target}-${edge ? "remove" : offset < 0 ? "up" : "down"}`,
        )
        ?.focus();
    });
  }

  return (
    <fieldset className="admin-fieldset admin-fieldset--nested">
      <legend>{label}</legend>
      {hint ? <p className="admin-fieldset__hint">{hint}</p> : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {value.length === 0 ? (
        <p className="admin-muted">No images chosen.</p>
      ) : (
        <ol className="admin-image-list">
          {value.map((item, index) => {
            const option = options.find(
              (candidate) => candidate.id === item.mediaId,
            );
            const name = describe(option);
            return (
              <li key={item.mediaId} className="admin-image-list__item">
                <div className="admin-image-choice">
                  <Thumb option={option} />
                  <span>
                    {index + 1}. {name}
                  </span>
                </div>
                <div className="admin-repeatable__buttons">
                  <button
                    type="button"
                    id={`${id}-${index}-up`}
                    className="admin-button admin-button--quiet"
                    aria-label={`Move up: ${name}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    id={`${id}-${index}-down`}
                    className="admin-button admin-button--quiet"
                    aria-label={`Move down: ${name}`}
                    disabled={index === value.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    id={`${id}-${index}-remove`}
                    className="admin-button admin-button--danger-quiet"
                    aria-label={`Remove: ${name}`}
                    onClick={() => {
                      onChange(
                        value.filter((_, position) => position !== index),
                      );
                      setAnnouncement(`${name} removed.`);
                    }}
                  >
                    Remove
                  </button>
                </div>
                <AltOverride
                  id={`${id}-${index}-alt`}
                  value={item.altOverride}
                  onChange={(altOverride) =>
                    onChange(
                      value.map((entry, position) =>
                        position === index ? { ...entry, altOverride } : entry,
                      ),
                    )
                  }
                />
              </li>
            );
          })}
        </ol>
      )}
      <MediaPicker
        options={options}
        multiple
        triggerLabel="Add images"
        title={`Add to ${label.toLowerCase()}`}
        exclude={[...exclude, ...value.map((item) => item.mediaId)]}
        onPick={(ids) => {
          onChange([
            ...value,
            ...ids.map((mediaId) => ({ mediaId, altOverride: null })),
          ]);
          setAnnouncement(
            `${ids.length} image${ids.length === 1 ? "" : "s"} added.`,
          );
        }}
      />
    </fieldset>
  );
}
