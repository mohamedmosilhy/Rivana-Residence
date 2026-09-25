"use client";

import Link from "next/link";

export default function MarketingError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <section
      className="site-holding site-container"
      aria-labelledby="error-title"
      role="alert"
    >
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
        <Link href="/">Go to the home page</Link>
      </p>
    </section>
  );
}
