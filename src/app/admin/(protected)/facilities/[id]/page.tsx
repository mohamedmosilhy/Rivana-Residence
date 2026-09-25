import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { readinessIssues } from "@/application/content/catalog-queries";
import type { MediaReference } from "@/application/ports/repositories";
import { requireStaff } from "@/composition/auth";
import { propertyTimeZone, facilityQueries } from "@/composition/content";
import { roleHasCapability } from "@/domain/auth/capabilities";
import { assertFacilityPublishable } from "@/domain/facilities/facility";
import { editorTextFromRichText } from "@/domain/shared/rich-text";
import { CatalogForm } from "@/presentation/admin/content/catalog-form";
import { EntityImagesForm } from "@/presentation/admin/media/entity-images-form";
import { PublicationPanel } from "@/presentation/admin/content/publication-panel";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { formatDateTime } from "@/presentation/admin/format";
import { Notice, noticeFrom } from "@/presentation/admin/ui/notice";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { Panel } from "@/presentation/admin/ui/states";

import {
  archiveFacilityAction,
  deleteFacilityAction,
  publishFacilityAction,
  restoreFacilityAction,
  saveFacilityMediaAction,
  unpublishFacilityAction,
  updateFacilityAction,
} from "../actions";

function heroOf(media: readonly MediaReference[]) {
  const hero = media.find((item) => item.role === "HERO");
  return hero ? { mediaId: hero.id, altOverride: hero.altOverride } : null;
}

export const metadata: Metadata = { title: "Edit facility" };

type EditFacilityPageProps = Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function EditFacilityPage({
  params,
  searchParams,
}: EditFacilityPageProps) {
  const { id } = await params;
  const { staff, allowed } = await requireStaff(
    `/admin/facilities/${id}`,
    "content:edit",
  );
  if (!allowed) return <DeniedPage title="Edit facility" />;

  const [loaded, timeZone, search] = await Promise.all([
    facilityQueries().get(staff, id),
    propertyTimeZone(),
    searchParams,
  ]);
  if (!loaded.ok) throw new Error("The facility is unavailable.");
  if (!loaded.value) notFound();
  const { record: facility, media, gaps } = loaded.value;

  return (
    <>
      <PageHeader
        title={facility.name}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Facilities", href: "/admin/facilities" },
        ]}
      />
      <Notice code={noticeFrom(search.notice)} />
      <PublicationPanel
        name={facility.name}
        noun="facility"
        status={facility.status}
        warnings={gaps}
        readiness={readinessIssues(() => assertFacilityPublishable(facility))}
        publicPath={`/facilities/${facility.slug}`}
        previewHref={`/admin/facilities/${facility.id}/preview` as Route}
        actions={{
          publish: publishFacilityAction.bind(null, facility.id),
          unpublish: unpublishFacilityAction.bind(null, facility.id),
          archive: archiveFacilityAction.bind(null, facility.id),
          restore: restoreFacilityAction.bind(null, facility.id),
          ...(roleHasCapability(staff.role, "content:delete")
            ? { delete: deleteFacilityAction.bind(null, facility.id) }
            : {}),
        }}
      />
      <Panel title="Facility details" titleId="facility-details-title" wide>
        <CatalogForm
          variant="facility"
          action={updateFacilityAction.bind(null, facility.id)}
          isNew={false}
          submitLabel="Save changes"
          meta={`Last saved ${formatDateTime(facility.updatedAt, timeZone)}.`}
          values={{
            name: facility.name,
            slug: facility.slug,
            shortDescription: facility.shortDescription,
            description: editorTextFromRichText(facility.description),
            featured: facility.featured,
            seoTitle: facility.seoTitle ?? "",
            seoDescription: facility.seoDescription ?? "",
            openingHoursText: facility.openingHoursText ?? "",
          }}
        />
      </Panel>
      <Panel title="Images" titleId="facility-images-title" wide>
        <EntityImagesForm
          noun="facility"
          action={saveFacilityMediaAction.bind(null, facility.id)}
          options={media}
          hero={heroOf(facility.media)}
          gallery={facility.media
            .filter((item) => item.role === "GALLERY")
            .map((item) => ({
              mediaId: item.id,
              altOverride: item.altOverride,
            }))}
          social={facility.ogMediaId}
        />
      </Panel>
    </>
  );
}
