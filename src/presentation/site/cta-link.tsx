import type { Route } from "next";
import Link from "next/link";

import { BookNowButton } from "@/presentation/site/book-now-button";

const TARGETS: Record<string, Route> = {
  CONTACT: "/contact",
  ROOMS: "/rooms",
  FACILITIES: "/facilities",
};

/** A section call to action. Booking stays an inert button. */
export function CtaLink({
  cta,
  bookingMessage,
}: Readonly<{ cta: unknown; bookingMessage: string }>) {
  if (typeof cta !== "object" || cta === null) return null;
  const { label, intent } = cta as { label?: unknown; intent?: unknown };
  if (typeof label !== "string" || !label.trim()) return null;
  if (intent === "BOOKING") {
    return <BookNowButton label={label} message={bookingMessage} />;
  }
  const href = typeof intent === "string" ? TARGETS[intent] : undefined;
  if (!href) return null;
  return (
    <Link href={href} className="site-button">
      {label}
    </Link>
  );
}
