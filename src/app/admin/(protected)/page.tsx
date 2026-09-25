import type { Metadata } from "next";
import Link from "next/link";

import { getAdminOverview } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { roleHasCapability } from "@/domain/auth/capabilities";
import { OverviewDashboard } from "@/presentation/admin/overview/overview-dashboard";
import { PageHeader } from "@/presentation/admin/ui/page-header";

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
          <nav aria-label="Shortcuts" className="admin-shortcuts">
            <Link
              href="/admin/pages"
              className="admin-button admin-button--secondary"
            >
              Pages
            </Link>
            <Link
              href="/admin/rooms"
              className="admin-button admin-button--secondary"
            >
              Rooms
            </Link>
            <Link
              href="/admin/media"
              className="admin-button admin-button--secondary"
            >
              Media
            </Link>
            <Link href="/" className="admin-button">
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
