import type { Metadata } from "next";

import { requireStaff } from "@/composition/auth";
import { CatalogForm } from "@/presentation/admin/content/catalog-form";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { Panel } from "@/presentation/admin/ui/states";

import { createFacilityAction } from "../actions";

export const metadata: Metadata = { title: "Add facility" };

export default async function NewFacilityPage() {
  const { allowed } = await requireStaff(
    "/admin/facilities/new",
    "content:edit",
  );
  if (!allowed) return <DeniedPage title="Add facility" />;

  return (
    <>
      <PageHeader
        title="Add facility"
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Facilities", href: "/admin/facilities" },
        ]}
        description={<p>New facilities are saved as private drafts.</p>}
      />
      <Panel title="Facility details" titleId="facility-details-title" wide>
        <CatalogForm
          variant="facility"
          action={createFacilityAction}
          isNew
          submitLabel="Create draft"
          values={{
            name: "",
            slug: "",
            shortDescription: "",
            description: "",
            featured: false,
            seoTitle: "",
            seoDescription: "",
            openingHoursText: "",
          }}
        />
      </Panel>
    </>
  );
}
