"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  isCurrentDestination,
  type NavItem,
} from "@/presentation/admin/navigation";

export function AdminNav({
  items,
  label,
}: Readonly<{ items: readonly NavItem[]; label: string }>) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="admin-nav">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={
                isCurrentDestination(pathname, item.href) ? "page" : undefined
              }
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
