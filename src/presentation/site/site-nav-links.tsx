"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SITE_LINKS } from "@/presentation/site/site-links";

export function SiteNavLinks({ className }: Readonly<{ className: string }>) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {SITE_LINKS.map((link) => {
        const current =
          link.href === "/"
            ? pathname === "/"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href}>
            <Link href={link.href} aria-current={current ? "page" : undefined}>
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
