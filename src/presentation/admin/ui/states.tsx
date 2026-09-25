import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  action,
}: Readonly<{ title: string; children?: ReactNode; action?: ReactNode }>) {
  return (
    <div className="admin-state">
      <h2 className="admin-state__title">{title}</h2>
      {children ? <div className="admin-state__body">{children}</div> : null}
      {action ? <div className="admin-state__action">{action}</div> : null}
    </div>
  );
}

export function LoadingState({
  label = "Loading",
}: Readonly<{ label?: string }>) {
  return (
    <div className="admin-state admin-state--loading" role="status">
      <span
        className="admin-skeleton admin-skeleton--title"
        aria-hidden="true"
      />
      <span className="admin-skeleton" aria-hidden="true" />
      <span
        className="admin-skeleton admin-skeleton--short"
        aria-hidden="true"
      />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function Panel({
  title,
  titleId,
  description,
  children,
  wide = false,
}: Readonly<{
  title: string;
  titleId: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}>) {
  return (
    <section
      className={`admin-card${wide ? " admin-card--wide" : ""}`}
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{title}</h2>
      {description ? (
        <div className="admin-card__description">{description}</div>
      ) : null}
      {children}
    </section>
  );
}
