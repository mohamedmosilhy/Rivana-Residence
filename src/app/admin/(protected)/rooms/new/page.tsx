import type { Metadata } from "next";

import { requireStaff } from "@/composition/auth";
import { roomQueries } from "@/composition/content";
import { CatalogForm } from "@/presentation/admin/content/catalog-form";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { Panel } from "@/presentation/admin/ui/states";

import { createRoomAction } from "../actions";

export const metadata: Metadata = { title: "Add room" };

export default async function NewRoomPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { staff, allowed } = await requireStaff(
    "/admin/rooms/new",
    "content:edit",
  );
  if (!allowed) return <DeniedPage title="Add room" />;
  const choice = await roomQueries().newRecordBranch(
    staff,
    (await searchParams).branch,
  );

  return (
    <>
      <PageHeader
        title="Add room"
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Rooms", href: "/admin/rooms" },
        ]}
        description={<p>New rooms are saved as private drafts.</p>}
      />
      <Panel title="Room details" titleId="room-details-title" wide>
        <CatalogForm
          variant="room"
          action={createRoomAction}
          isNew
          branchOptions={
            choice.ok
              ? {
                  branches: choice.value.branches,
                  selected: choice.value.selected?.slug ?? null,
                }
              : null
          }
          submitLabel="Create draft"
          values={{
            name: "",
            slug: "",
            shortDescription: "",
            description: "",
            featured: false,
            seoTitle: "",
            seoDescription: "",
            accommodationType: "ROOM",
            bedroomCount: "",
            bathroomCount: "",
            sizeSqm: "",
            maxAdults: "2",
            maxChildren: "0",
            bedSummary: "",
            viewSummary: "",
            features: [],
          }}
        />
      </Panel>
    </>
  );
}
