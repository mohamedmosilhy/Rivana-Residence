"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";

import { SITE_LINKS } from "@/presentation/site/site-links";

export function SiteNavLinks({
  className,
  numbered = false,
}: Readonly<{ className: string; numbered?: boolean }>) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {SITE_LINKS.map((link, index) => {
        const current =
          link.href === "/"
            ? pathname === "/"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li
            key={link.href}
            style={numbered ? ({ "--i": index } as CSSProperties) : undefined}
          >
            <Link href={link.href} aria-current={current ? "page" : undefined}>
              {numbered ? (
                <span className="site-menu__index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
              ) : null}
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
