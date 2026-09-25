"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNavLink({
  href,
  children,
}: Readonly<{ href: Route; children: string }>) {
  const pathname = usePathname();
  return (
    <Link href={href} aria-current={pathname === href ? "page" : undefined}>
      {children}
    </Link>
  );
}
