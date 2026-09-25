import type { Route } from "next";

// Shared by server and client components, so it lives outside any
// "use client" module (server code would otherwise get a client reference).
export const SITE_LINKS: readonly Readonly<{ href: Route; label: string }>[] = [
  { href: "/", label: "Home" },
  { href: "/rooms", label: "Rooms" },
  { href: "/facilities", label: "Facilities" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];
