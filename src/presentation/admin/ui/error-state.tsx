"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

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
    <div className="admin-state admin-state--error" role="alert">
      <h1 ref={headingRef} tabIndex={-1} className="admin-state__title">
        This page could not be loaded
      </h1>
      <div className="admin-state__body">
        <p>
          Nothing you saved earlier was lost. Try again, or go back to the
          overview.
        </p>
        {reference ? (
          <p className="admin-muted">Reference: {reference}</p>
        ) : null}
      </div>
      <div className="admin-state__action">
        <button type="button" className="admin-button" onClick={retry}>
          Try again
        </button>
        <Link href="/admin" className="admin-link">
          Go to overview
        </Link>
      </div>
    </div>
  );
}
