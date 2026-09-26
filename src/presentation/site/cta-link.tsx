import type { Route } from "next";
import Link from "next/link";

import { BookNowButton } from "@/presentation/site/book-now-button";
import { actionFill, button } from "@/presentation/site/classes";

const TARGETS: Record<string, Route> = {
  CONTACT: "/contact",
  ROOMS: "/rooms",
  FACILITIES: "/facilities",
};

/** A section call to action, in a row of actions. Booking stays inert. */
export function CtaLink({
  cta,
  bookingMessage,
  dark = false,
}: Readonly<{ cta: unknown; bookingMessage: string; dark?: boolean }>) {
  if (typeof cta !== "object" || cta === null) return null;
  const { label, intent } = cta as { label?: unknown; intent?: unknown };
  if (typeof label !== "string" || !label.trim()) return null;
  if (intent === "BOOKING") {
    return (
      <BookNowButton
        label={label}
        message={bookingMessage}
        placement={dark ? "dark" : "light"}
        inActions
      />
    );
  }
  const href = typeof intent === "string" ? TARGETS[intent] : undefined;
  if (!href) return null;
  return (
    <Link
      href={href}
      className={button(dark ? "primary-dark" : "primary", actionFill)}
    >
      {label}
    </Link>
  );
}
