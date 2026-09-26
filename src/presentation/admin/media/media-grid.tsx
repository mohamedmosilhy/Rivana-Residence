import type { Route } from "next";
import Link from "next/link";

import type { MediaListItem } from "@/application/ports/repositories";
import { Badge } from "@/presentation/admin/ui/badge";
import {
  MIME_LABELS,
  formatBytes,
  mediaUrl,
} from "@/presentation/admin/media/media-url";
import { badgeGroup } from "@/presentation/admin/ui/classes";

function StatusBadges({ item }: Readonly<{ item: MediaListItem }>) {
  return (
    <span className={badgeGroup}>
      {item.status === "FAILED" ? <Badge tone="danger">Failed</Badge> : null}
      {item.status === "PENDING" ? (
        <Badge tone="warning">Uploading</Badge>
      ) : null}
      {item.status === "READY" && !item.altText.trim() ? (
        <Badge tone="warning">Missing alt text</Badge>
      ) : null}
      {item.rightsStatus === "UNCONFIRMED" && item.status !== "FAILED" ? (
        <Badge tone="warning">Rights not confirmed</Badge>
      ) : null}
      {item.status === "READY" ? (
        <Badge>
          {item.usageCount === 0 ? "Unused" : `Used ${item.usageCount}×`}
        </Badge>
      ) : null}
    </span>
  );
}

// Each card is one link with a visible description; the thumbnail is
// decorative within it, so screen readers hear the description once.
export function MediaGrid({
  items,
}: Readonly<{ items: readonly MediaListItem[] }>) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-4">
      {items.map((item) => (
        <li
          key={item.id}
          data-media-card=""
          className="grid content-start gap-2 rounded-panel border border-neutral-300 bg-surface p-2"
        >
          <Link
            href={`/admin/media/${item.id}` as Route}
            className="group/media grid gap-1 rounded-control"
          >
            <span className="grid aspect-[4/3] place-items-center overflow-hidden rounded-control bg-admin-canvas">
              {item.status === "READY" ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin thumbnails are served as stored
                <img
                  src={mediaUrl(item.storageKey)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <span
                  className="text-[1.5rem] text-neutral-600"
                  aria-hidden="true"
                >
                  {item.status === "FAILED" ? "!" : "…"}
                </span>
              )}
            </span>
            <span className="text-[0.875rem] font-medium text-neutral-950 [overflow-wrap:anywhere] group-hover/media:underline">
              {item.altText.trim() || item.originalFilename}
            </span>
            <span className="text-[0.75rem] text-neutral-600">
              {item.status === "FAILED"
                ? (item.failureReason ?? "The upload failed.")
                : [
                    MIME_LABELS[item.mimeType] ?? item.mimeType,
                    item.width && item.height
                      ? `${item.width}×${item.height}`
                      : null,
                    formatBytes(item.bytes),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </Link>
          <StatusBadges item={item} />
        </li>
      ))}
    </ul>
  );
}
