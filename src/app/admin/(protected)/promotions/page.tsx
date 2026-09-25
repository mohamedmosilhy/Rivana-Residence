import type { Metadata } from "next";

import { getAdminOverview } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { DestinationPlaceholder } from "@/presentation/admin/destination-placeholder";

export const metadata: Metadata = {
  title: "Promotions",
};

export default async function PromotionsPage() {
  const { allowed } = await requireStaff(
    "/admin/promotions",
    "promotions:manage",
  );
  if (!allowed) return <DeniedPage title="Promotions" />;
  const overview = await getAdminOverview();
  if (!overview.ok) throw new Error("Overview is unavailable.");
  const { promotions } = overview.value;

  return (
    <DestinationPlaceholder
      title="Promotions"
      description="Promotional pop-ups shown to website visitors."
      facts={[
        {
          label: "Showing now",
          value: promotions.active ? promotions.active.internalName : "None",
        },
        { label: "Scheduled", value: String(promotions.scheduledCount) },
      ]}
      upcoming={[
        "Write the pop-up headline, message, code, and terms",
        "Schedule start and end times in the property time zone",
        "Preview, publish, and archive promotions",
      ]}
    />
  );
}
