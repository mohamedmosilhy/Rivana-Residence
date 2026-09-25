import Link from "next/link";
import type { ReactNode } from "react";

import { ROLE_LABELS } from "@/presentation/admin/format";
import type { NavItem } from "@/presentation/admin/navigation";
import { AccountMenu } from "@/presentation/admin/shell/account-menu";
import { AdminNav } from "@/presentation/admin/shell/admin-nav";
import { MobileNav } from "@/presentation/admin/shell/mobile-nav";
import { ToastProvider } from "@/presentation/admin/ui/toast";
import { BrandMark } from "@/presentation/design/brand-mark";

type AdminShellProps = Readonly<{
  children: ReactNode;
  staff: Readonly<{ name: string; role: keyof typeof ROLE_LABELS }>;
  navigation: readonly NavItem[];
  signOutAction: () => Promise<void>;
}>;

export function AdminShell({
  children,
  staff,
  navigation,
  signOutAction,
}: AdminShellProps) {
  return (
    <ToastProvider>
      <div className="admin-shell">
        <a className="skip-link" href="#admin-content">
          Skip to admin content
        </a>
        <aside className="admin-sidebar">
          <Link href="/admin" className="admin-sidebar__brand">
            <BrandMark inverse />
            <span className="sr-only">admin overview</span>
          </Link>
          <AdminNav items={navigation} label="Admin" />
          <Link href="/" className="admin-sidebar__site">
            View website
          </Link>
        </aside>
        <div className="admin-frame">
          <header className="admin-topbar">
            <div className="admin-topbar__start">
              <MobileNav items={navigation} />
              <Link href="/admin" className="admin-topbar__brand">
                <BrandMark />
                <span className="sr-only">admin overview</span>
              </Link>
            </div>
            <AccountMenu
              name={staff.name}
              roleLabel={ROLE_LABELS[staff.role]}
              signOutAction={signOutAction}
            />
          </header>
          <main id="admin-content" className="admin-main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
