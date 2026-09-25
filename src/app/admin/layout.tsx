import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminShell } from "@/presentation/admin/admin-shell";

export const metadata: Metadata = {
  title: "Admin foundation",
  robots: {
    index: false,
    follow: false,
  },
};

type AdminLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function AdminLayout({ children }: AdminLayoutProps) {
  return <AdminShell>{children}</AdminShell>;
}
