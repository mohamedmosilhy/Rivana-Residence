// The permanent redirect table for the URLs the site had before branch
// websites (Phase 7 routes and the legacy `*.html` paths; spec 0002). Every
// destination is final, so each old URL takes exactly one `308` hop. Kept
// free of imports so next.config.ts can load it, and tested as plain data.
export function legacyRedirects(branchSlug: string) {
  const branch = `/${branchSlug}`;
  return [
    ["/about", `${branch}/about`],
    ["/contact", `${branch}/contact`],
    ["/rooms", `${branch}/stay`],
    ["/rooms/:slug", `${branch}/stay/:slug`],
    ["/facilities", `${branch}/facilities`],
    ["/facilities/:slug", `${branch}/facilities/:slug`],
    ["/index.html", branch],
    ["/about.html", `${branch}/about`],
    ["/contact.html", `${branch}/contact`],
    ["/rooms.html", `${branch}/stay`],
    ["/room-studio-balcony.html", `${branch}/stay/studio-with-balcony`],
    ["/room-deluxe-double.html", `${branch}/stay/deluxe-double`],
    ["/gym.html", `${branch}/facilities/fitness-room`],
    ["/swimming-pool.html", `${branch}/facilities/swimming-pool`],
  ].map(([source, destination]) => ({
    source: source!,
    destination: destination!,
    permanent: true as const,
  }));
}
