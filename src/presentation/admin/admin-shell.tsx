import type { ReactNode } from "react";

import { AdminNavLink } from "@/presentation/admin/admin-nav-link";
import { BrandMark } from "@/presentation/design/brand-mark";

const futureDestinations = [
  "Pages",
  "Rooms",
  "Facilities",
  "Media",
  "Promotions",
  "Enquiries",
];

const roleLabels = { ADMIN: "Administrator", EDITOR: "Editor" } as const;

type AdminShellProps = Readonly<{
  children: ReactNode;
  staff: Readonly<{ name: string; role: keyof typeof roleLabels }>;
  canManageStaff: boolean;
  signOutAction: () => Promise<void>;
}>;

export function AdminShell({
  children,
  staff,
  canManageStaff,
  signOutAction,
}: AdminShellProps) {
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-content">
        Skip to admin content
      </a>
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div>
          <BrandMark />
          <nav aria-label="Primary admin">
            <ul className="admin-nav">
              <li>
                <AdminNavLink href="/admin">Overview</AdminNavLink>
              </li>
              {futureDestinations.map((destination) => (
                <li key={destination}>
                  <span aria-disabled="true">{destination}</span>
                </li>
              ))}
              {canManageStaff ? (
                <li>
                  <AdminNavLink href="/admin/staff">Staff</AdminNavLink>
                </li>
              ) : null}
              <li>
                <AdminNavLink href="/admin/account">Account</AdminNavLink>
              </li>
            </ul>
          </nav>
        </div>
        <div className="admin-account">
          <p className="admin-account__name">{staff.name}</p>
          <p className="admin-account__role">{roleLabels[staff.role]}</p>
          <form action={signOutAction}>
            <button
              className="admin-button admin-button--inverse"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main id="admin-content" className="admin-main">
        {children}
      </main>
    </div>
  );
}
