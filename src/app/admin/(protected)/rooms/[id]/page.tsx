import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { readinessIssues } from "@/application/content/catalog-queries";
import { requireStaff } from "@/composition/auth";
import { propertyTimeZone, roomQueries } from "@/composition/content";
import { roleHasCapability } from "@/domain/auth/capabilities";
import { assertRoomPublishable } from "@/domain/rooms/room";
import { editorTextFromRichText } from "@/domain/shared/rich-text";
import { CatalogForm } from "@/presentation/admin/content/catalog-form";
import { MediaSelectionForm } from "@/presentation/admin/content/media-selection-form";
import { PublicationPanel } from "@/presentation/admin/content/publication-panel";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { formatDateTime } from "@/presentation/admin/format";
import { Notice, noticeFrom } from "@/presentation/admin/ui/notice";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { Panel } from "@/presentation/admin/ui/states";

import {
  archiveRoomAction,
  deleteRoomAction,
  publishRoomAction,
  restoreRoomAction,
  saveRoomMediaAction,
  unpublishRoomAction,
  updateRoomAction,
} from "../actions";

export const metadata: Metadata = { title: "Edit room" };

type EditRoomPageProps = Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function EditRoomPage({
  params,
  searchParams,
}: EditRoomPageProps) {
  const { id } = await params;
  const { staff, allowed } = await requireStaff(
    `/admin/rooms/${id}`,
    "content:edit",
  );
  if (!allowed) return <DeniedPage title="Edit room" />;

  const [loaded, timeZone, search] = await Promise.all([
    roomQueries().get(staff, id),
    propertyTimeZone(),
    searchParams,
  ]);
  if (!loaded.ok) throw new Error("The room is unavailable.");
  if (!loaded.value) notFound();
  const { record: room, media } = loaded.value;

  return (
    <>
      <PageHeader
        title={room.name}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Rooms", href: "/admin/rooms" },
        ]}
      />
      <Notice code={noticeFrom(search.notice)} />
      <PublicationPanel
        name={room.name}
        noun="room"
        status={room.status}
        readiness={readinessIssues(() => assertRoomPublishable(room))}
        publicPath={`/rooms/${room.slug}`}
        previewHref={`/admin/rooms/${room.id}/preview` as Route}
        actions={{
          publish: publishRoomAction.bind(null, room.id),
          unpublish: unpublishRoomAction.bind(null, room.id),
          archive: archiveRoomAction.bind(null, room.id),
          restore: restoreRoomAction.bind(null, room.id),
          ...(roleHasCapability(staff.role, "content:delete")
            ? { delete: deleteRoomAction.bind(null, room.id) }
            : {}),
        }}
      />
      <Panel title="Room details" titleId="room-details-title" wide>
        <CatalogForm
          variant="room"
          action={updateRoomAction.bind(null, room.id)}
          isNew={false}
          submitLabel="Save changes"
          meta={`Last saved ${formatDateTime(room.updatedAt, timeZone)}.`}
          values={{
            name: room.name,
            slug: room.slug,
            shortDescription: room.shortDescription,
            description: editorTextFromRichText(room.description),
            featured: room.featured,
            seoTitle: room.seoTitle ?? "",
            seoDescription: room.seoDescription ?? "",
            sizeSqm: room.sizeSqm?.toString() ?? "",
            maxAdults: String(room.maxAdults),
            maxChildren: String(room.maxChildren),
            bedSummary: room.bedSummary ?? "",
            viewSummary: room.viewSummary ?? "",
            features: room.features.map((feature) => feature.label),
          }}
        />
      </Panel>
      <Panel title="Images" titleId="room-images-title" wide>
        <MediaSelectionForm
          noun="room"
          action={saveRoomMediaAction.bind(null, room.id)}
          options={media}
          heroId={room.media.find((item) => item.role === "HERO")?.id ?? null}
          galleryIds={room.media
            .filter((item) => item.role === "GALLERY")
            .map((item) => item.id)}
        />
      </Panel>
    </>
  );
}
