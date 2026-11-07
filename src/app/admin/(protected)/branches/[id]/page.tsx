import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireStaff } from "@/composition/auth";
import { manageBranches, propertyTimeZone } from "@/composition/content";
import { mediaLibrary } from "@/composition/media";
import { DEFAULT_BRANCH_SLUG } from "@/domain/branches";
import { BranchForm } from "@/presentation/admin/branches/branch-form";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { formatDateTime } from "@/presentation/admin/format";
import { Notice, noticeFrom } from "@/presentation/admin/ui/notice";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { Panel } from "@/presentation/admin/ui/states";

import { updateBranchAction } from "../actions";

export const metadata: Metadata = { title: "Edit branch" };

const text = (value: string | number | null) =>
  value === null ? "" : String(value);

export default async function EditBranchPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { id } = await params;
  const { staff, allowed } = await requireStaff(
    `/admin/branches/${id}`,
    "branches:manage",
  );
  if (!allowed) return <DeniedPage title="Edit branch" />;
  const [loaded, media, timeZone, query] = await Promise.all([
    manageBranches().get(staff, id),
    mediaLibrary().then((library) => library.options(staff)),
    propertyTimeZone(),
    searchParams,
  ]);
  if (!loaded.ok) throw new Error("The branch is unavailable.");
  const branch = loaded.value;
  if (!branch) notFound();

  return (
    <>
      <PageHeader
        title={branch.name}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Branches", href: "/admin/branches" },
        ]}
        description={<p>Website address: /{branch.slug}</p>}
      />
      <Notice code={noticeFrom(query.notice)} />
      <Panel title="Branch details" titleId="branch-details-title" wide>
        <BranchForm
          action={updateBranchAction.bind(null, branch.id)}
          isNew={false}
          isDefault={branch.slug === DEFAULT_BRANCH_SLUG}
          options={media.ok ? media.value : []}
          submitLabel="Save changes"
          meta={`Last saved ${formatDateTime(branch.updatedAt, timeZone)}.`}
          values={{
            name: branch.name,
            slug: branch.slug,
            summary: text(branch.summary),
            status: branch.status,
            phone: text(branch.phone),
            email: text(branch.email),
            addressLine1: text(branch.addressLine1),
            addressLine2: text(branch.addressLine2),
            city: text(branch.city),
            country: text(branch.country),
            latitude: text(branch.latitude),
            longitude: text(branch.longitude),
            checkInTime: text(branch.checkInTime),
            checkOutTime: text(branch.checkOutTime),
            mapEmbedUrl: text(branch.mapEmbedUrl),
            sortOrder: String(branch.sortOrder),
            heroMediaId: branch.heroMediaId,
          }}
        />
      </Panel>
    </>
  );
}
