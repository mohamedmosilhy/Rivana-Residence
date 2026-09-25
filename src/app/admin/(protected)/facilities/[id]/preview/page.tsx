import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { requireStaff } from "@/composition/auth";
import { facilityQueries } from "@/composition/content";
import { CatalogPreview } from "@/presentation/admin/content/catalog-preview";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { PageHeader } from "@/presentation/admin/ui/page-header";

export const metadata: Metadata = { title: "Preview facility" };

export default async function FacilityPreviewPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const { staff, allowed } = await requireStaff(
    `/admin/facilities/${id}/preview`,
    "content:edit",
  );
  if (!allowed) return <DeniedPage title="Preview facility" />;
  const loaded = await facilityQueries().get(staff, id);
  if (!loaded.ok) throw new Error("The facility is unavailable.");
  if (!loaded.value) notFound();
  const facility = loaded.value.record;

  const facts = facility.openingHoursText
    ? [`Opening hours: ${facility.openingHoursText}`]
    : [];

  return (
    <>
      <PageHeader
        title={`Preview: ${facility.name}`}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Facilities", href: "/admin/facilities" },
          {
            label: facility.name,
            href: `/admin/facilities/${facility.id}` as Route,
          },
        ]}
      />
      <CatalogPreview
        status={facility.status}
        name={facility.name}
        shortDescription={facility.shortDescription}
        description={facility.description}
        facts={facts}
        heroChosen={facility.media.some((media) => media.role === "HERO")}
        galleryCount={
          facility.media.filter((media) => media.role === "GALLERY").length
        }
      />
    </>
  );
}
