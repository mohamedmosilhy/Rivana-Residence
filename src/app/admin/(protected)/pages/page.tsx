import type { Metadata } from "next";

import { getAdminOverview } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { DestinationPlaceholder } from "@/presentation/admin/destination-placeholder";

export const metadata: Metadata = {
  title: "Pages",
};

export default async function PagesPage() {
  const { allowed } = await requireStaff("/admin/pages", "content:edit");
  if (!allowed) return <DeniedPage title="Pages" />;
  const overview = await getAdminOverview();
  if (!overview.ok) throw new Error("Overview is unavailable.");
  const { pages } = overview.value;

  return (
    <DestinationPlaceholder
      title="Pages"
      description="The Home, About, and Contact pages and their sections."
      facts={[
        { label: "Published", value: String(pages.published) },
        { label: "Total pages", value: String(pages.total) },
      ]}
      upcoming={[
        "Edit each section of Home, About, and Contact",
        "Show, hide, and reorder the optional sections",
        "Preview and publish changes",
      ]}
    />
  );
}
