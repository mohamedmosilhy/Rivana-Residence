import type { Metadata } from "next";

import { getAdminOverview } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { DestinationPlaceholder } from "@/presentation/admin/destination-placeholder";

export const metadata: Metadata = {
  title: "Media",
};

export default async function MediaPage() {
  const { allowed } = await requireStaff("/admin/media", "media:upload");
  if (!allowed) return <DeniedPage title="Media" />;
  const overview = await getAdminOverview();
  if (!overview.ok) throw new Error("Overview is unavailable.");
  const { media } = overview.value;

  return (
    <DestinationPlaceholder
      title="Media"
      description="Photos used across the website."
      facts={[
        { label: "Ready images", value: String(media.ready) },
        { label: "Missing alt text", value: String(media.missingAltText) },
        { label: "Failed uploads", value: String(media.failed) },
      ]}
      upcoming={[
        "Upload photos and describe them with alt text",
        "Set the focal point used when photos are cropped",
        "See where each photo is used before replacing or removing it",
      ]}
    />
  );
}
