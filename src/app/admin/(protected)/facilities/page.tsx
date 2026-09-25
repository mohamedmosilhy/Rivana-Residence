import type { Metadata } from "next";

import { getAdminOverview } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { DestinationPlaceholder } from "@/presentation/admin/destination-placeholder";

export const metadata: Metadata = {
  title: "Facilities",
};

export default async function FacilitiesPage() {
  const { allowed } = await requireStaff("/admin/facilities", "content:edit");
  if (!allowed) return <DeniedPage title="Facilities" />;
  const overview = await getAdminOverview();
  if (!overview.ok) throw new Error("Overview is unavailable.");
  const { facilities } = overview.value;

  return (
    <DestinationPlaceholder
      title="Facilities"
      description="Facilities such as the pool, cafe, and spa."
      facts={[
        { label: "Published", value: String(facilities.PUBLISHED) },
        { label: "Draft", value: String(facilities.DRAFT) },
        { label: "Archived", value: String(facilities.ARCHIVED) },
      ]}
      upcoming={[
        "Add and edit facilities and opening hours",
        "Choose featured facilities and their order",
        "Publish or archive facilities",
      ]}
    />
  );
}
