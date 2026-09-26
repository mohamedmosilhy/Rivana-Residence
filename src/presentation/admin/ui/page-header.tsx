import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { link } from "@/presentation/admin/ui/classes";

const crumbItem =
  "not-first:before:mx-2 not-first:before:text-neutral-600 not-first:before:content-['/']";

export type Crumb = Readonly<{ label: string; href?: Route }>;

type PageHeaderProps = Readonly<{
  title: string;
  /** Ancestors of the current page; the current page is appended. */
  breadcrumbs?: readonly Crumb[];
  description?: ReactNode;
  actions?: ReactNode;
}>;

export function PageHeader({
  title,
  breadcrumbs = [{ label: "Overview", href: "/admin" }],
  description,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-8">
      {breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="mb-3 flex flex-wrap text-[0.875rem] text-neutral-600">
            {breadcrumbs.map((crumb) => (
              <li key={crumb.label} className={crumbItem}>
                {crumb.href ? (
                  <Link href={crumb.href} className={link}>
                    {crumb.label}
                  </Link>
                ) : (
                  crumb.label
                )}
              </li>
            ))}
            <li aria-current="page" className={crumbItem}>
              {title}
            </li>
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="m-0 text-[clamp(1.625rem,3vw,2rem)] leading-[1.2] font-medium text-neutral-950">
            {title}
          </h1>
          {description ? (
            <div className="[&_p]:[margin:0.5rem_0_0] [&_p]:max-w-[65ch] [&_p]:text-neutral-600">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
