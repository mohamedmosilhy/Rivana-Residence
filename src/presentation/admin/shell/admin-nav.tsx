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
  inSheet = false,
}: Readonly<{ items: readonly NavItem[]; label: string; inSheet?: boolean }>) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="grid gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`block rounded-control px-3 text-inverse-body [transition:background_var(--motion-fast)] hover:bg-inverse-active hover:text-surface aria-[current=page]:bg-inverse-active aria-[current=page]:font-medium aria-[current=page]:text-surface aria-[current=page]:shadow-[inset_3px_0_0_var(--color-gold-400)] ${inSheet ? "py-3" : "py-2"}`}
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
