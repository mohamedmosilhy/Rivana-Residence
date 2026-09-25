import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import type { PublicationStatus } from "@/domain/shared/types";
import { PublicLink } from "@/presentation/admin/content/public-link";
import { PublicationBadge } from "@/presentation/admin/ui/badge";
import { ConfirmAction } from "@/presentation/admin/ui/confirm-action";
import type { FormAction } from "@/presentation/admin/ui/form-state";

export type PublicationActions = Readonly<{
  publish?: FormAction;
  unpublish?: FormAction;
  archive?: FormAction;
  restore?: FormAction;
  /** Present only for administrators. */
  delete?: FormAction;
}>;

type PublicationPanelProps = Readonly<{
  name: string;
  /** Lower-case noun, e.g. "room". */
  noun: string;
  status: PublicationStatus;
  readiness: readonly string[];
  /** The public address; omitted for records without one (promotions). */
  publicPath?: string;
  previewHref?: Route;
  actions: PublicationActions;
  /** Extra status, e.g. which promotion is showing. */
  children?: ReactNode;
}>;

// Status, publish-readiness, and the lifecycle actions for one record. Each
// action confirms first and states its public impact.
export function PublicationPanel({
  name,
  noun,
  status,
  readiness,
  publicPath,
  previewHref,
  actions,
  children,
}: PublicationPanelProps) {
  const ready = readiness.length === 0;
  return (
    <section
      className="admin-card admin-card--wide admin-publication"
      aria-labelledby="publication-title"
    >
      <div className="admin-publication__header">
        <h2 id="publication-title">Publication</h2>
        <PublicationBadge status={status} />
      </div>

      {status !== "ARCHIVED" ? (
        ready ? (
          <p>
            {status === "PUBLISHED"
              ? `This ${noun} is live on the website.`
              : `This ${noun} is ready to publish.`}
          </p>
        ) : (
          <div className="admin-readiness">
            <p>
              <strong>
                {status === "PUBLISHED"
                  ? "Fix these before saving further changes:"
                  : "Before this can be published:"}
              </strong>
            </p>
            <ul>
              {readiness.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )
      ) : (
        <p>
          This {noun} is archived. It is hidden from the website and the active
          list.
        </p>
      )}

      {children}
      {publicPath ? (
        <PublicLink path={publicPath} isPublic={status === "PUBLISHED"} />
      ) : null}

      <div className="admin-publication__actions">
        {previewHref ? (
          <Link
            href={previewHref}
            className="admin-button admin-button--secondary"
          >
            Preview
          </Link>
        ) : null}
        {status === "DRAFT" && ready && actions.publish ? (
          <ConfirmAction
            triggerLabel="Publish"
            title={`Publish ${name}?`}
            confirmLabel="Publish"
            pendingLabel="Publishing…"
            tone="primary"
            action={actions.publish}
          >
            <p>It becomes visible on the public website straight away.</p>
          </ConfirmAction>
        ) : null}
        {status === "PUBLISHED" && actions.unpublish ? (
          <ConfirmAction
            triggerLabel="Unpublish"
            title={`Unpublish ${name}?`}
            confirmLabel="Unpublish"
            pendingLabel="Unpublishing…"
            tone="danger"
            action={actions.unpublish}
          >
            <p>
              It disappears from the public website and returns to draft. Its
              content is kept.
            </p>
          </ConfirmAction>
        ) : null}
        {status !== "ARCHIVED" && actions.archive ? (
          <ConfirmAction
            triggerLabel="Archive"
            title={`Archive ${name}?`}
            confirmLabel="Archive"
            pendingLabel="Archiving…"
            tone="danger"
            action={actions.archive}
          >
            <p>
              {status === "PUBLISHED"
                ? `It is removed from the public website immediately. `
                : ""}
              It leaves the active list. You can restore it later as a draft.
            </p>
          </ConfirmAction>
        ) : null}
        {status === "ARCHIVED" && actions.restore ? (
          <ConfirmAction
            triggerLabel="Restore as draft"
            title={`Restore ${name}?`}
            confirmLabel="Restore"
            pendingLabel="Restoring…"
            action={actions.restore}
          >
            <p>It returns as an unpublished draft at the end of the list.</p>
          </ConfirmAction>
        ) : null}
        {status === "ARCHIVED" && actions.delete ? (
          <ConfirmAction
            triggerLabel="Delete permanently"
            title={`Permanently delete ${name}?`}
            confirmLabel="Delete permanently"
            pendingLabel="Deleting…"
            tone="danger"
            action={actions.delete}
          >
            <p>
              The {noun} and its content are removed for good. This cannot be
              undone. Images stay in the media library.
            </p>
          </ConfirmAction>
        ) : null}
      </div>
    </section>
  );
}
