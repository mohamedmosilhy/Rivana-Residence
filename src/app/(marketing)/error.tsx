"use client";

import Link from "next/link";
import {
  button,
  heroTitle,
  holding,
  holdingActions,
  holdingContent,
  holdingEyebrow,
  holdingMuted,
  holdingText,
} from "@/presentation/site/classes";

export default function MarketingError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <section
      data-dark-surface=""
      className={holding}
      aria-labelledby="error-title"
      role="alert"
    >
      <div
        className={`${holdingContent} pt-[calc(var(--header-height)+3rem)] pb-20`}
      >
        <p className={holdingEyebrow}>Error</p>
        <h1 id="error-title" className={heroTitle}>
          Something went wrong
        </h1>
        <p className={holdingText}>
          Please try again. If the problem continues, contact us by phone or
          email.
        </p>
        {error.digest ? (
          <p className={holdingMuted}>Reference: {error.digest}</p>
        ) : null}
        <p className={holdingActions}>
          <button
            type="button"
            className={button("primary-dark")}
            onClick={reset}
          >
            Try again
          </button>
          <Link href="/" className={button("ghost-dark")}>
            Go to the home page
          </Link>
        </p>
      </div>
    </section>
  );
}
