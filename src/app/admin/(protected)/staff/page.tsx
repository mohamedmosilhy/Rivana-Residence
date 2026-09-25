import type { Metadata } from "next";

import { listStaffAccounts, requireStaff } from "@/composition/auth";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { StaffTable } from "@/presentation/admin/staff/staff-table";
import { PageHeader } from "@/presentation/admin/ui/page-header";

export const metadata: Metadata = {
  title: "Staff",
};

export default async function StaffPage() {
  const { allowed } = await requireStaff("/admin/staff", "users:manage");
  if (!allowed) return <DeniedPage title="Staff" />;

  const staff = await listStaffAccounts();

  return (
    <>
      <PageHeader
        title="Staff"
        description={
          <p>
            Accounts are created, deactivated, and given roles with the operator
            command line (<code>npm run staff</code>).
          </p>
        }
      />
      <StaffTable staff={staff.ok ? staff.value : []} />
    </>
  );
}
