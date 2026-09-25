import type { Route } from "next";

import { roleHasCapability, type Capability } from "@/domain/auth/capabilities";
import type { AdminRole } from "@/domain/shared/types";

export type AdminDestination = Readonly<{
  href: Route;
  label: string;
  capability: Capability;
}>;

// The order is the sidebar order. Each destination's page enforces the same
// capability on the server; hiding a link is only a convenience.
export const ADMIN_DESTINATIONS = [
  { href: "/admin", label: "Overview", capability: "admin:access" },
  { href: "/admin/pages", label: "Pages", capability: "content:edit" },
  { href: "/admin/rooms", label: "Rooms", capability: "content:edit" },
  {
    href: "/admin/facilities",
    label: "Facilities",
    capability: "content:edit",
  },
  { href: "/admin/media", label: "Media", capability: "media:upload" },
  {
    href: "/admin/promotions",
    label: "Promotions",
    capability: "promotions:manage",
  },
  {
    href: "/admin/enquiries",
    label: "Enquiries",
    capability: "enquiries:read",
  },
  { href: "/admin/settings", label: "Settings", capability: "settings:edit" },
  { href: "/admin/staff", label: "Staff", capability: "users:manage" },
] as const satisfies readonly AdminDestination[];

export type NavItem = Readonly<{ href: Route; label: string }>;

export function navigationFor(role: AdminRole): readonly NavItem[] {
  return ADMIN_DESTINATIONS.filter((destination) =>
    roleHasCapability(role, destination.capability),
  ).map(({ href, label }) => ({ href, label }));
}

/** True when `pathname` is the destination or one of its sub-pages. */
export function isCurrentDestination(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
