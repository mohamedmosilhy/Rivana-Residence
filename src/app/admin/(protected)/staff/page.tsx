import type { Metadata } from "next";

import { listStaffAccounts, requireStaff } from "@/composition/auth";
import { AccessDenied } from "@/presentation/admin/auth/access-denied";
import { StaffTable } from "@/presentation/admin/staff/staff-table";

export const metadata: Metadata = {
  title: "Staff",
};

export default async function StaffPage() {
  const { allowed } = await requireStaff("/admin/staff", "users:manage");
  if (!allowed) return <AccessDenied />;

  const staff = await listStaffAccounts();

  return (
    <>
      <header className="admin-header">
        <div>
          <p className="admin-header__eyebrow">Administration</p>
          <h1>Staff</h1>
          <p className="admin-header__meta">
            Accounts are provisioned and deactivated with the operator CLI (
            <code>npm run staff</code>).
          </p>
        </div>
      </header>
      <section
        className="admin-card admin-card--wide"
        aria-label="Staff accounts"
      >
        <StaffTable staff={staff.ok ? staff.value : []} />
      </section>
    </>
  );
}
