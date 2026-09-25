"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type DragEvent } from "react";

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif";

type Item = {
  key: number;
  file: File;
  progress: number;
  status: "waiting" | "uploading" | "done" | "failed";
  message: string;
  assetId: string | null;
  duplicateOf: string | null;
};

type UploaderProps = Readonly<{
  /** One file only (replacement) or many (library). */
  multiple?: boolean;
  /** Called with the new asset id after each successful upload. */
  onUploaded?: (assetId: string) => void;
  label?: string;
}>;

function send(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/admin/media/upload");
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    request.setRequestHeader(
      "X-Upload-Filename",
      encodeURIComponent(file.name),
    );
    request.setRequestHeader("X-Upload-Rights", "confirmed");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(request.responseText) as Record<string, unknown>;
      } catch {
        // Keep the generic message below.
      }
      resolve({ status: request.status, body });
    };
    request.onerror = () =>
      resolve({
        status: 0,
        body: { message: "The connection failed. Try again." },
      });
    request.send(file);
  });
}

// Drag and drop is an enhancement: the "Choose images" button and file
// input are the primary, keyboard-accessible path. Progress is shown per
// file; starts, finishes, and failures are announced once each.
export function Uploader({
  multiple = true,
  onUploaded,
  label = "Upload images",
}: UploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const [rights, setRights] = useState(false);
  const [rightsError, setRightsError] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const headingId = useId();
  const rightsId = useId();

  const update = (key: number, patch: Partial<Item>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );

  async function upload(item: Item) {
    update(item.key, { status: "uploading", progress: 0, message: "" });
    setAnnouncement(`Uploading ${item.file.name}.`);
    const { status, body } = await send(item.file, (fraction) =>
      update(item.key, { progress: fraction }),
    );
    if (status === 201) {
      const assetId = String(body.id);
      update(item.key, { status: "done", progress: 1, assetId });
      setAnnouncement(`${item.file.name} uploaded.`);
      onUploaded?.(assetId);
      return true;
    }
    const message =
      typeof body.message === "string"
        ? body.message
        : "The upload failed. Try again.";
    update(item.key, {
      status: "failed",
      message,
      duplicateOf:
        typeof body.duplicateOf === "string" ? body.duplicateOf : null,
    });
    setAnnouncement(`${item.file.name} was not uploaded: ${message}`);
    if (status === 401) router.push("/admin/login?returnTo=%2Fadmin%2Fmedia");
    return false;
  }

  async function start(files: readonly File[]) {
    if (!rights) {
      setRightsError(true);
      document.getElementById(rightsId)?.focus();
      return;
    }
    const chosen = (multiple ? files : files.slice(0, 1)).map((file) => ({
      key: nextKey.current++,
      file,
      progress: 0,
      status: "waiting" as const,
      message: "",
      assetId: null,
      duplicateOf: null,
    }));
    setItems((current) => [...(multiple ? current : []), ...chosen]);
    let uploaded = 0;
    for (const item of chosen) {
      if (await upload(item)) uploaded += 1;
    }
    if (uploaded > 0) router.refresh();
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void start([...event.dataTransfer.files]);
  }

  return (
    <section className="admin-uploader" aria-labelledby={headingId}>
      <h2 id={headingId} className="admin-section__title">
        {label}
      </h2>
      <p className="admin-muted">
        JPEG, PNG, WebP, or AVIF, up to 15 MB and 40 megapixels. Location and
        camera details are removed automatically.
      </p>
      <div className="admin-field">
        <label className="admin-check">
          <input
            type="checkbox"
            id={rightsId}
            checked={rights}
            aria-invalid={rightsError || undefined}
            aria-describedby={rightsError ? `${rightsId}-error` : undefined}
            onChange={(event) => {
              setRights(event.target.checked);
              setRightsError(false);
            }}
          />
          I confirm Rivana Residence may use these images on its website
        </label>
        {rightsError ? (
          <p className="admin-field__errors" id={`${rightsId}-error`}>
            Confirm the usage rights before uploading.
          </p>
        ) : null}
      </div>
      <div
        className={`admin-dropzone${dragging ? " admin-dropzone--active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>Drag images here, or</p>
        <button
          type="button"
          className="admin-button"
          onClick={() => inputRef.current?.click()}
        >
          {multiple ? "Choose images" : "Choose an image"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple={multiple}
          className="sr-only"
          tabIndex={-1}
          aria-label={multiple ? "Choose images" : "Choose an image"}
          onChange={(event) => {
            void start([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {items.length > 0 ? (
        <ul className="admin-upload-list">
          {items.map((item) => (
            <li
              key={item.key}
              className={`admin-upload admin-upload--${item.status}`}
            >
              <span className="admin-upload__name">{item.file.name}</span>
              {item.status === "uploading" || item.status === "waiting" ? (
                <progress
                  max={1}
                  value={item.progress}
                  aria-label={`Upload progress for ${item.file.name}`}
                />
              ) : null}
              <span className="admin-upload__status">
                {item.status === "waiting" && "Waiting"}
                {item.status === "uploading" &&
                  `Uploading ${Math.round(item.progress * 100)}%`}
                {item.status === "done" && "Uploaded"}
                {item.status === "failed" && item.message}
              </span>
              {item.status === "done" && item.assetId && multiple ? (
                <Link
                  className="admin-link"
                  href={`/admin/media/${item.assetId}` as Route}
                  aria-label={`Add details for ${item.file.name}`}
                >
                  Add details
                </Link>
              ) : null}
              {item.status === "failed" && item.duplicateOf ? (
                <Link
                  className="admin-link"
                  href={`/admin/media/${item.duplicateOf}` as Route}
                >
                  Open the existing image
                </Link>
              ) : null}
              {item.status === "failed" && !item.duplicateOf ? (
                <button
                  type="button"
                  className="admin-button admin-button--quiet"
                  aria-label={`Try again: ${item.file.name}`}
                  onClick={() =>
                    void upload(item).then((ok) => ok && router.refresh())
                  }
                >
                  Try again
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
