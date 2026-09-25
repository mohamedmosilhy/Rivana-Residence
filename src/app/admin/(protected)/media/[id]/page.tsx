import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { MediaUsage } from "@/application/ports/repositories";
import { requireStaff } from "@/composition/auth";
import { mediaLibrary } from "@/composition/media";
import { propertyTimeZone } from "@/composition/content";
import { roleHasCapability } from "@/domain/auth/capabilities";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { formatDateTime } from "@/presentation/admin/format";
import { MediaDetailsForm } from "@/presentation/admin/media/media-details-form";
import {
  MIME_LABELS,
  formatBytes,
  mediaUrl,
} from "@/presentation/admin/media/media-url";
import { ReplaceImage } from "@/presentation/admin/media/replace-image";
import { Badge } from "@/presentation/admin/ui/badge";
import { ConfirmAction } from "@/presentation/admin/ui/confirm-action";
import { Notice, noticeFrom } from "@/presentation/admin/ui/notice";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { Panel } from "@/presentation/admin/ui/states";

import {
  deleteMediaAction,
  replaceMediaAction,
  saveMediaDetailsAction,
  setMediaRightsAction,
} from "../actions";

export const metadata: Metadata = { title: "Image" };

function usageHref(usage: MediaUsage): Route {
  switch (usage.kind) {
    case "ROOM":
    case "ROOM_SHARING":
      return `/admin/rooms/${usage.ownerId}` as Route;
    case "FACILITY":
    case "FACILITY_SHARING":
      return `/admin/facilities/${usage.ownerId}` as Route;
    case "PAGE_SECTION":
    case "PAGE_SHARING":
      return `/admin/pages/${usage.ownerId.toLowerCase()}` as Route;
    case "SITE_SETTINGS":
      return "/admin/settings";
  }
}

type MediaDetailPageProps = Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function MediaDetailPage({
  params,
  searchParams,
}: MediaDetailPageProps) {
  const { id } = await params;
  const { staff, allowed } = await requireStaff(
    `/admin/media/${id}`,
    "media:upload",
  );
  if (!allowed) return <DeniedPage title="Image" />;

  const library = await mediaLibrary();
  const [loaded, timeZone, search] = await Promise.all([
    library.details(staff, id),
    propertyTimeZone(),
    searchParams,
  ]);
  if (!loaded.ok) throw new Error("The image is unavailable.");
  const asset = loaded.value;
  if (!asset) notFound();

  const canDelete = roleHasCapability(staff.role, "media:delete");
  const canConfirmRights = roleHasCapability(staff.role, "media:rights");
  const publicUsage = asset.usage.filter((usage) => usage.isPublic).length;
  const title = asset.altText.trim() || asset.originalFilename;

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Media", href: "/admin/media" },
        ]}
      />
      <Notice code={noticeFrom(search.notice)} />

      {asset.status === "FAILED" ? (
        <Panel title="Upload failed" titleId="failed-title" wide>
          <p>{asset.failureReason ?? "The image could not be verified."}</p>
          <p>
            Nothing from this upload is stored or shown. Upload the file again
            from the{" "}
            <Link href="/admin/media" className="admin-link">
              media library
            </Link>
            .
          </p>
        </Panel>
      ) : null}

      {asset.status === "READY" ? (
        <Panel title="Details" titleId="details-title" wide>
          <MediaDetailsForm
            action={saveMediaDetailsAction.bind(null, asset.id)}
            src={mediaUrl(asset.storageKey)}
            width={asset.width ?? 1}
            height={asset.height ?? 1}
            altText={asset.altText}
            caption={asset.caption ?? ""}
            credit={asset.credit ?? ""}
            focalX={asset.focalX}
            focalY={asset.focalY}
          />
        </Panel>
      ) : null}

      <Panel title="File" titleId="file-title" wide>
        <dl className="admin-description-list">
          <div>
            <dt>Original file name</dt>
            <dd>{asset.originalFilename}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{MIME_LABELS[asset.mimeType] ?? asset.mimeType}</dd>
          </div>
          {asset.width && asset.height ? (
            <div>
              <dt>Dimensions</dt>
              <dd>
                {asset.width} × {asset.height} pixels
              </dd>
            </div>
          ) : null}
          {asset.status === "READY" ? (
            <div>
              <dt>Size</dt>
              <dd>{formatBytes(asset.bytes)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Added</dt>
            <dd>
              {formatDateTime(asset.createdAt, timeZone)}
              {asset.createdByName ? ` by ${asset.createdByName}` : ""}
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {asset.sourceReference
                ? `Imported from ${asset.sourceReference.replace(/^reference:/, "")}`
                : "Uploaded by staff"}
            </dd>
          </div>
          <div>
            <dt>Usage rights</dt>
            <dd>
              {asset.rightsStatus === "CONFIRMED" ? (
                <Badge tone="success">Confirmed</Badge>
              ) : (
                <Badge tone="warning">Not confirmed</Badge>
              )}
            </dd>
          </div>
        </dl>
        {asset.rightsStatus === "UNCONFIRMED" ? (
          <p>
            Content that uses this image cannot be published until its usage
            rights are confirmed.
          </p>
        ) : null}
        {canConfirmRights && asset.status === "READY" ? (
          <div className="admin-card__actions">
            {asset.rightsStatus === "UNCONFIRMED" ? (
              <ConfirmAction
                triggerLabel="Confirm usage rights"
                title="Confirm usage rights?"
                confirmLabel="Confirm rights"
                pendingLabel="Saving…"
                tone="primary"
                action={setMediaRightsAction.bind(null, asset.id, "CONFIRMED")}
              >
                <p>
                  Confirm only if Rivana Residence owns this image or has
                  permission to use it on the website.
                </p>
              </ConfirmAction>
            ) : (
              <ConfirmAction
                triggerLabel="Withdraw usage rights"
                title="Withdraw usage rights?"
                confirmLabel="Withdraw"
                pendingLabel="Saving…"
                tone="danger"
                action={setMediaRightsAction.bind(
                  null,
                  asset.id,
                  "UNCONFIRMED",
                )}
              >
                <p>Content using this image will not be publishable.</p>
              </ConfirmAction>
            )}
          </div>
        ) : null}
      </Panel>

      <Panel title="Where it is used" titleId="usage-title" wide>
        {asset.usage.length === 0 ? (
          <p>This image is not used anywhere.</p>
        ) : (
          <ul className="admin-usage-list">
            {asset.usage.map((usage, index) => (
              <li key={`${usage.kind}:${usage.ownerId}:${usage.role}:${index}`}>
                <Link href={usageHref(usage)} className="admin-link">
                  {usage.ownerName}
                </Link>{" "}
                <span className="admin-muted">— {usage.role}</span>{" "}
                {usage.isPublic ? (
                  <Badge tone="success">Public</Badge>
                ) : (
                  <Badge>Not public</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {asset.status === "READY" ? (
        <Panel
          title="Replace"
          titleId="replace-title"
          description={
            <p>
              Upload a new version. It is checked first, then it takes this
              image’s place everywhere at once.
            </p>
          }
          wide
        >
          <ReplaceImage
            action={replaceMediaAction.bind(null, asset.id)}
            usageCount={asset.usage.length}
            publicUsageCount={publicUsage}
          />
        </Panel>
      ) : null}

      {canDelete ? (
        <Panel title="Delete" titleId="delete-title" wide>
          {asset.usage.length > 0 ? (
            <p>
              This image is used in {asset.usage.length} place
              {asset.usage.length === 1 ? "" : "s"}, so it cannot be deleted.
              Replace it or remove it from those places first.
            </p>
          ) : (
            <>
              <p>This image is not used, so it can be deleted permanently.</p>
              <div className="admin-card__actions">
                <ConfirmAction
                  triggerLabel="Delete image"
                  title={`Delete “${title}” permanently?`}
                  confirmLabel="Delete permanently"
                  pendingLabel="Deleting…"
                  tone="danger"
                  action={deleteMediaAction.bind(null, asset.id)}
                >
                  <p>
                    The file is removed from storage. This cannot be undone.
                  </p>
                </ConfirmAction>
              </div>
            </>
          )}
        </Panel>
      ) : null}
    </>
  );
}
