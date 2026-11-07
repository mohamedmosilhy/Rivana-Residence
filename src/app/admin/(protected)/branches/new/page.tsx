import type { Metadata } from "next";

import { requireStaff } from "@/composition/auth";
import { mediaLibrary } from "@/composition/media";
import { BranchForm } from "@/presentation/admin/branches/branch-form";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { Panel } from "@/presentation/admin/ui/states";

import { createBranchAction } from "../actions";

export const metadata: Metadata = { title: "Add branch" };

export default async function NewBranchPage() {
  const { staff, allowed } = await requireStaff(
    "/admin/branches/new",
    "branches:manage",
  );
  if (!allowed) return <DeniedPage title="Add branch" />;
  const media = await mediaLibrary().then((library) => library.options(staff));

  return (
    <>
      <PageHeader
        title="Add branch"
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Branches", href: "/admin/branches" },
        ]}
        description={
          <p>
            The new branch gets its own Home, About, and Contact pages as
            unpublished drafts. Add its rooms, apartments, and facilities in the
            content screens.
          </p>
        }
      />
      <Panel title="Branch details" titleId="branch-details-title" wide>
        <BranchForm
          action={createBranchAction}
          isNew
          options={media.ok ? media.value : []}
          submitLabel="Create branch"
          values={{
            name: "",
            slug: "",
            summary: "",
            status: "INACTIVE",
            phone: "",
            email: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            country: "Egypt",
            latitude: "",
            longitude: "",
            checkInTime: "",
            checkOutTime: "",
            mapEmbedUrl: "",
            sortOrder: "0",
            heroMediaId: null,
          }}
        />
      </Panel>
    </>
  );
}
