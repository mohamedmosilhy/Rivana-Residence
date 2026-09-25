import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { requireStaff } from "@/composition/auth";
import { roomQueries } from "@/composition/content";
import { CatalogPreview } from "@/presentation/admin/content/catalog-preview";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { PageHeader } from "@/presentation/admin/ui/page-header";

export const metadata: Metadata = { title: "Preview room" };

export default async function RoomPreviewPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const { staff, allowed } = await requireStaff(
    `/admin/rooms/${id}/preview`,
    "content:edit",
  );
  if (!allowed) return <DeniedPage title="Preview room" />;
  const loaded = await roomQueries().get(staff, id);
  if (!loaded.ok) throw new Error("The room is unavailable.");
  if (!loaded.value) notFound();
  const room = loaded.value.record;

  const facts = [
    room.sizeSqm ? `${room.sizeSqm} m²` : null,
    `Up to ${room.maxAdults} adult${room.maxAdults === 1 ? "" : "s"}${
      room.maxChildren
        ? ` and ${room.maxChildren} child${room.maxChildren === 1 ? "" : "ren"}`
        : ""
    }`,
    room.bedSummary,
    room.viewSummary,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <>
      <PageHeader
        title={`Preview: ${room.name}`}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Rooms", href: "/admin/rooms" },
          { label: room.name, href: `/admin/rooms/${room.id}` as Route },
        ]}
      />
      <CatalogPreview
        status={room.status}
        name={room.name}
        shortDescription={room.shortDescription}
        description={room.description}
        facts={facts}
        features={room.features.map((feature) => feature.label)}
        heroChosen={room.media.some((media) => media.role === "HERO")}
        galleryCount={
          room.media.filter((media) => media.role === "GALLERY").length
        }
      />
    </>
  );
}
