import type { Metadata } from "next";
import Link from "next/link";

import { getAdminOverview } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { roleHasCapability } from "@/domain/auth/capabilities";
import { OverviewDashboard } from "@/presentation/admin/overview/overview-dashboard";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { button } from "@/presentation/admin/ui/classes";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function AdminOverviewPage() {
  const { staff } = await requireStaff("/admin");
  const overview = await getAdminOverview();
  if (!overview.ok) throw new Error("Overview is unavailable.");

  return (
    <>
      <PageHeader
        title="Overview"
        breadcrumbs={[]}
        description={<p>Welcome back, {staff.name}.</p>}
        actions={
          <nav aria-label="Shortcuts" className="flex flex-wrap gap-2">
            <Link href="/admin/pages" className={button("secondary")}>
              Pages
            </Link>
            <Link href="/admin/rooms" className={button("secondary")}>
              Rooms
            </Link>
            <Link href="/admin/media" className={button("secondary")}>
              Media
            </Link>
            <Link href="/" className={button()}>
              View website
            </Link>
          </nav>
        }
      />
      <OverviewDashboard
        overview={overview.value}
        canEditSettings={roleHasCapability(staff.role, "settings:edit")}
      />
    </>
  );
}
