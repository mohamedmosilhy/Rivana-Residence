"use client";

import { useId, useState } from "react";

// Booking is not connected yet. This control is deliberately inert: it is
// a real button (never a link), goes nowhere, submits nothing, and explains
// how to book instead. aria-disabled keeps it focusable so keyboard and
// screen-reader users can discover the explanation.
export function BookNowButton({
  message,
  label = "Book now",
  className = "",
}: Readonly<{ message: string; label?: string; className?: string }>) {
  const [announced, setAnnounced] = useState(false);
  const statusId = useId();
  return (
    <span className="book-now">
      <button
        type="button"
        className={`site-button site-button--booking ${className}`}
        aria-disabled="true"
        aria-describedby={statusId}
        data-booking="unavailable"
        onClick={() => setAnnounced(true)}
      >
        {label}
      </button>
      <span
        id={statusId}
        role="status"
        className={announced ? "book-now__status" : "sr-only"}
      >
        {message}
      </span>
    </span>
  );
}
