import type { Route } from "next";

export type SiteLink = Readonly<{ href: Route; label: string }>;

// Shared by server and client components, so it lives outside any
// "use client" module (server code would otherwise get a client reference).
// Every link stays in the current branch (spec 0002); the stay link is
// labelled by what the branch offers and hidden when it offers nothing;
// the Facilities link likewise needs a published facility.
export function siteLinks(
  branchSlug: string,
  stayLabel: string | null,
  hasFacilities = true,
): readonly SiteLink[] {
  const base = `/${branchSlug}`;
  return [
    { href: base as Route, label: "Home" },
    ...(stayLabel ? [{ href: `${base}/stay` as Route, label: stayLabel }] : []),
    ...(hasFacilities
      ? [{ href: `${base}/facilities` as Route, label: "Facilities" }]
      : []),
    { href: `${base}/about` as Route, label: "About" },
    { href: `${base}/contact` as Route, label: "Contact" },
  ];
}

/** Whether a nav link is the current page: Home only at the branch root. */
export function isCurrentLink(
  href: string,
  pathname: string,
  branchHome: string,
) {
  return href === branchHome
    ? pathname === branchHome
    : pathname === href || pathname.startsWith(`${href}/`);
}
