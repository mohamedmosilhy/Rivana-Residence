import type { Metadata } from "next";
import Link from "next/link";

import { getAdminOverview } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { roleHasCapability } from "@/domain/auth/capabilities";
import { OverviewDashboard } from "@/presentation/admin/overview/overview-dashboard";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { button } from "@/presentation/admin/ui/classes";
import { Panel } from "@/presentation/admin/ui/states";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function AdminOverviewPage() {
  const { staff } = await requireStaff("/admin");
  // Receptionists and Managers have no CMS capability: they get a staff home
  // without content counts, and the content overview is never read for them.
  if (!roleHasCapability(staff.role, "content:edit")) {
    return (
      <>
        <PageHeader
          title="Overview"
          breadcrumbs={[]}
          description={<p>Welcome back, {staff.name}.</p>}
        />
        <Panel title="Front desk" titleId="front-desk-title">
          <p data-testid="staff-home">
            Front desk tools will appear here in a later release.
          </p>
        </Panel>
      </>
    );
  }
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
