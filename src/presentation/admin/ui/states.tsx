import type { ReactNode } from "react";
import {
  card,
  cardWide,
  state,
  stateAction,
  stateBody,
  stateTitle,
} from "@/presentation/admin/ui/classes";

const SKELETON =
  "block animate-[admin-pulse_1.4s_ease-in-out_infinite] rounded-control bg-neutral-300 opacity-60";

export function EmptyState({
  title,
  children,
  action,
}: Readonly<{ title: string; children?: ReactNode; action?: ReactNode }>) {
  return (
    <div className={state}>
      <h2 className={stateTitle}>{title}</h2>
      {children ? <div className={stateBody}>{children}</div> : null}
      {action ? <div className={stateAction}>{action}</div> : null}
    </div>
  );
}

export function LoadingState({
  label = "Loading",
}: Readonly<{ label?: string }>) {
  return (
    <div className={`${state} border-solid`} role="status">
      <span
        className={`${SKELETON} h-6 w-[min(100%,14rem)]`}
        aria-hidden="true"
      />
      <span
        className={`${SKELETON} h-3.5 w-[min(100%,32rem)]`}
        aria-hidden="true"
      />
      <span
        className={`${SKELETON} h-3.5 w-[min(100%,18rem)]`}
        aria-hidden="true"
      />
      <span className="visually-hidden">{label}…</span>
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
      className={wide ? cardWide : card}
      data-admin-card=""
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{title}</h2>
      {description ? <div className="[&_p]:!mt-2">{description}</div> : null}
      {children}
    </section>
  );
}
