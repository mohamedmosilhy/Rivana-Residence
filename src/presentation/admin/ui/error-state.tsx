"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  button,
  link,
  muted,
  state,
  stateAction,
  stateBody,
  stateTitle,
} from "@/presentation/admin/ui/classes";

// Shown when a page fails unexpectedly. It never shows the error message,
// which may contain internal details; the digest lets support find the
// matching server log entry.
export function AdminErrorState({
  reference,
  retry,
}: Readonly<{ reference?: string | undefined; retry: () => void }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div
      className={`${state} border-solid border-l-4 border-l-danger`}
      role="alert"
    >
      <h1 ref={headingRef} tabIndex={-1} className={stateTitle}>
        This page could not be loaded
      </h1>
      <div className={stateBody}>
        <p>
          Nothing you saved earlier was lost. Try again, or go back to the
          overview.
        </p>
        {reference ? <p className={muted}>Reference: {reference}</p> : null}
      </div>
      <div className={stateAction}>
        <button type="button" className={button()} onClick={retry}>
          Try again
        </button>
        <Link href="/admin" className={link}>
          Go to overview
        </Link>
      </div>
    </div>
  );
}
