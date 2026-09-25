"use client";

import Link from "next/link";

export default function MarketingError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <section
      className="site-holding"
      aria-labelledby="error-title"
      role="alert"
    >
      <div className="site-holding__content site-container">
        <p className="site-eyebrow">Error</p>
        <h1 id="error-title">Something went wrong</h1>
        <p>
          Please try again. If the problem continues, contact us by phone or
          email.
        </p>
        {error.digest ? (
          <p className="site-muted">Reference: {error.digest}</p>
        ) : null}
        <p className="site-holding__actions">
          <button type="button" className="site-button" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="site-button site-button--ghost">
            Go to the home page
          </Link>
        </p>
      </div>
    </section>
  );
}
