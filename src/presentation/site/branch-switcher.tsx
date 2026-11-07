"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { switchTarget } from "@/domain/branches";
import { Icon } from "@/presentation/site/icons";

export type SwitcherBranch = Readonly<{
  slug: string;
  name: string;
  hasListings: boolean;
  hasFacilities: boolean;
}>;

const VARIANTS = {
  // In the header bar: a quiet disclosure under the branch name.
  bar: {
    summary:
      "inline-flex min-h-11 cursor-pointer list-none items-center gap-2 whitespace-nowrap text-[0.75rem] font-medium tracking-[0.18em] uppercase [&::-webkit-details-marker]:hidden",
    panel:
      "absolute top-[calc(100%+0.25rem)] right-0 z-10 grid min-w-56 bg-surface p-2 text-neutral-950 shadow-[var(--shadow-md)]",
    link: "flex min-h-11 items-center px-3 hover:bg-plum-50 aria-[current=true]:font-medium aria-[current=true]:text-plum-800",
  },
  // In the menu sheet: large links on plum.
  menu: {
    summary:
      "inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-[0.8125rem] font-medium tracking-[0.18em] text-gold-400 uppercase [&::-webkit-details-marker]:hidden",
    panel: "grid gap-1 pt-2",
    link: "flex min-h-11 items-center font-display text-heading-md text-surface aria-[current=true]:text-gold-400",
  },
} as const;

/**
 * Branch name plus a switcher (shown only with two or more active branches;
 * spec 0002). A native disclosure with plain links, so it works without
 * JavaScript and by keyboard. Targets keep the page type where the other
 * branch has it (`switchTarget`).
 */
export function BranchSwitcher({
  current,
  branches,
  variant = "bar",
}: Readonly<{
  current: string;
  branches: readonly SwitcherBranch[];
  variant?: keyof typeof VARIANTS;
}>) {
  const pathname = usePathname();
  const styles = VARIANTS[variant];
  const currentName =
    branches.find((branch) => branch.slug === current)?.name ?? current;
  return (
    <details data-branch-switcher="" className="relative">
      <summary className={styles.summary}>
        {variant === "bar" ? (
          <Icon
            name="pin"
            className="size-5 flex-none text-gold-400 xl:hidden"
          />
        ) : null}
        <span className="visually-hidden">Current branch: </span>
        {/* Long names are shortened in the bar; the full name is in the list. */}
        <span
          className={
            variant === "bar"
              ? // A pin alone below 1280 px, where the bar is full.
                "max-w-[10rem] truncate max-xl:sr-only"
              : undefined
          }
          title={currentName}
        >
          {currentName}
        </span>
        <span aria-hidden="true">▾</span>
        <span className="visually-hidden">, change branch</span>
      </summary>
      <ul className={`m-0 list-none p-0 ${styles.panel}`}>
        {branches.map((branch) => (
          <li key={branch.slug}>
            <Link
              href={
                (branch.slug === current
                  ? pathname
                  : switchTarget(pathname, branch)) as Route
              }
              aria-current={branch.slug === current ? "true" : undefined}
              className={styles.link}
            >
              {branch.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
