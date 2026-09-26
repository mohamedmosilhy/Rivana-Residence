import Link from "next/link";
import type { ReactNode } from "react";

import { ROLE_LABELS } from "@/presentation/admin/format";
import type { NavItem } from "@/presentation/admin/navigation";
import { AccountMenu } from "@/presentation/admin/shell/account-menu";
import { AdminNav } from "@/presentation/admin/shell/admin-nav";
import { MobileNav } from "@/presentation/admin/shell/mobile-nav";
import { ToastProvider } from "@/presentation/admin/ui/toast";
import { BrandMark } from "@/presentation/design/brand-mark";
import { skipLink } from "@/presentation/design/classes";

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
      <div className="grid min-h-screen grid-cols-[15.5rem_minmax(0,1fr)] bg-[linear-gradient(to_right,var(--color-plum-900)_15.5rem,var(--color-admin-canvas)_15.5rem)] text-neutral-800 max-lg:grid-cols-[minmax(0,1fr)] max-lg:bg-admin-canvas max-lg:bg-none">
        <a className={skipLink} href="#admin-content">
          Skip to admin content
        </a>
        <aside className="sticky top-0 flex h-screen flex-col gap-10 overflow-y-auto bg-plum-900 px-5 py-8 text-surface max-lg:hidden">
          <Link href="/admin" className="px-3">
            <BrandMark inverse />
            <span className="visually-hidden">admin overview</span>
          </Link>
          <AdminNav items={navigation} label="Admin" />
          <Link
            href="/"
            className="mt-auto border-t border-inverse-line-subtle p-3 text-[0.875rem] text-inverse-body hover:text-surface"
          >
            View website
          </Link>
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex min-h-15 items-center justify-between gap-4 border-b border-neutral-300 bg-surface px-[clamp(1rem,4vw,3rem)] py-2">
            <div className="flex items-center gap-3">
              <MobileNav items={navigation} />
              <Link href="/admin" className="hidden max-lg:inline-block">
                <BrandMark size="topbar" />
                <span className="visually-hidden">admin overview</span>
              </Link>
            </div>
            <AccountMenu
              name={staff.name}
              roleLabel={ROLE_LABELS[staff.role]}
              signOutAction={signOutAction}
            />
          </header>
          <main
            id="admin-content"
            className="w-full max-w-[72rem] p-[clamp(1.25rem,4vw,3rem)] focus:[outline:none]"
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
