import type { Metadata } from "next";

import { getAdminOverview } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { DestinationPlaceholder } from "@/presentation/admin/destination-placeholder";

export const metadata: Metadata = {
  title: "Rooms",
};

export default async function RoomsPage() {
  const { allowed } = await requireStaff("/admin/rooms", "content:edit");
  if (!allowed) return <DeniedPage title="Rooms" />;
  const overview = await getAdminOverview();
  if (!overview.ok) throw new Error("Overview is unavailable.");
  const { rooms } = overview.value;

  return (
    <DestinationPlaceholder
      title="Rooms"
      description="Room types shown on the website."
      facts={[
        { label: "Published", value: String(rooms.PUBLISHED) },
        { label: "Draft", value: String(rooms.DRAFT) },
        { label: "Archived", value: String(rooms.ARCHIVED) },
      ]}
      upcoming={[
        "Add and edit rooms, their features, and search details",
        "Choose featured rooms and their order",
        "Publish or archive rooms",
      ]}
    />
  );
}
