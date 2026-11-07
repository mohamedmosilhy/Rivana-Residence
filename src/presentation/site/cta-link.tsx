import type { Route } from "next";
import Link from "next/link";

import { BookNowButton } from "@/presentation/site/book-now-button";
import { actionFill, button } from "@/presentation/site/classes";

// Section links stay inside the current branch (spec 0002).
const TARGETS: Record<string, string> = {
  CONTACT: "contact",
  ROOMS: "stay",
  FACILITIES: "facilities",
};

/** A section call to action, in a row of actions. Booking stays inert. */
export function CtaLink({
  cta,
  branchSlug,
  bookingMessage,
  dark = false,
}: Readonly<{
  cta: unknown;
  branchSlug: string;
  bookingMessage: string;
  dark?: boolean;
}>) {
  if (typeof cta !== "object" || cta === null) return null;
  const { label, intent } = cta as { label?: unknown; intent?: unknown };
  if (typeof label !== "string" || !label.trim()) return null;
  if (intent === "BOOKING") {
    return (
      <BookNowButton
        label={label}
        message={bookingMessage}
        branchSlug={branchSlug}
        placement={dark ? "dark" : "light"}
        inActions
      />
    );
  }
  const target = typeof intent === "string" ? TARGETS[intent] : undefined;
  if (!target) return null;
  return (
    <Link
      href={`/${branchSlug}/${target}` as Route}
      className={button(dark ? "primary-dark" : "primary", actionFill)}
    >
      {label}
    </Link>
  );
}
