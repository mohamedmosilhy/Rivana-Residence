"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";

import { SITE_LINKS } from "@/presentation/site/site-links";

const VARIANTS = {
  // The desktop bar: small caps with a gold rule under the current page.
  bar: {
    list: "flex gap-[clamp(1.25rem,2.6vw,2.5rem)]",
    item: "",
    link: "relative inline-flex min-h-11 items-center text-[0.8125rem] font-medium tracking-[0.18em] uppercase after:absolute after:right-0 after:bottom-2 after:left-0 after:h-px after:origin-left after:bg-gold-400 after:[transform:scaleX(0)] after:[transition:transform_var(--motion-surface)_var(--ease-out-soft)] hover:after:[transform:scaleX(1)] aria-[current=page]:after:[transform:scaleX(1)] header-scrolled:after:bg-gold-600",
  },
  // The menu sheet: large display type, numbered, rising in one by one.
  menu: {
    list: "grid",
    item: "menu-open:animate-[site-rise_700ms_var(--ease-out-soft)_calc(200ms+var(--i,0)*60ms)_both] menu-closing:animate-[site-fade-out_180ms_ease-in_both]",
    link: "flex items-baseline gap-4 border-b border-inverse-line-subtle py-3 font-display text-[clamp(1.875rem,1.4rem+3vw,2.75rem)] leading-[1.2] text-surface aria-[current=page]:text-gold-400",
  },
} as const;

export function SiteNavLinks({
  variant,
}: Readonly<{ variant: keyof typeof VARIANTS }>) {
  const pathname = usePathname();
  const styles = VARIANTS[variant];
  const numbered = variant === "menu";
  return (
    <ul className={styles.list}>
      {SITE_LINKS.map((link, index) => {
        const current =
          link.href === "/"
            ? pathname === "/"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li
            key={link.href}
            className={styles.item || undefined}
            style={numbered ? ({ "--i": index } as CSSProperties) : undefined}
          >
            <Link
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={styles.link}
            >
              {numbered ? (
                <span
                  className="font-body text-[0.75rem] tracking-[0.16em] text-gold-400"
                  aria-hidden="true"
                >
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
