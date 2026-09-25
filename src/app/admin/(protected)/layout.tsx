import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentStaff } from "@/composition/auth";
import { roleHasCapability } from "@/domain/auth/capabilities";
import { AdminShell } from "@/presentation/admin/admin-shell";

import { signOutAction } from "./actions";

// Layouts do not re-run on every navigation, so each page below also calls
// `requireStaff`. This check only keeps the shell from rendering signed out.
export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/login");

  return (
    <AdminShell
      staff={staff}
      canManageStaff={roleHasCapability(staff.role, "users:manage")}
      signOutAction={signOutAction}
    >
      {children}
    </AdminShell>
  );
}
