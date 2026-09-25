import type { Route } from "next";
import Link from "next/link";

import type { MediaListItem } from "@/application/ports/repositories";
import { Badge } from "@/presentation/admin/ui/badge";
import {
  MIME_LABELS,
  formatBytes,
  mediaUrl,
} from "@/presentation/admin/media/media-url";

function StatusBadges({ item }: Readonly<{ item: MediaListItem }>) {
  return (
    <span className="admin-badges">
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
    <ul className="admin-media-grid">
      {items.map((item) => (
        <li key={item.id} className="admin-media-card">
          <Link
            href={`/admin/media/${item.id}` as Route}
            className="admin-media-card__link"
          >
            <span className="admin-media-card__frame">
              {item.status === "READY" ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin thumbnails are served as stored
                <img src={mediaUrl(item.storageKey)} alt="" loading="lazy" />
              ) : (
                <span
                  className="admin-media-card__placeholder"
                  aria-hidden="true"
                >
                  {item.status === "FAILED" ? "!" : "…"}
                </span>
              )}
            </span>
            <span className="admin-media-card__title">
              {item.altText.trim() || item.originalFilename}
            </span>
            <span className="admin-media-card__meta">
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
