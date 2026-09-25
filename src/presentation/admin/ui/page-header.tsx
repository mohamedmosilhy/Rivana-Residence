import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

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
    <header className="admin-page-header">
      {breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="admin-breadcrumb">
          <ol>
            {breadcrumbs.map((crumb) => (
              <li key={crumb.label}>
                {crumb.href ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  crumb.label
                )}
              </li>
            ))}
            <li aria-current="page">{title}</li>
          </ol>
        </nav>
      ) : null}
      <div className="admin-page-header__row">
        <div>
          <h1>{title}</h1>
          {description ? (
            <div className="admin-page-header__description">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="admin-page-header__actions">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
