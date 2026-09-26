# SEO

## Goals

Help prospective guests discover Rivana Residence and understand its location, rooms, and facilities without publishing unsupported price or availability claims.

## Metadata model

Site Settings supplies brand name, title template, default description, canonical origin, default social image, and social profiles. Page, Room, and Facility records can override SEO title, description, and OG image.

Fallbacks:

- title: explicit SEO title → content title plus site name;
- description: explicit SEO description → sanitized/truncated short description → site default;
- social image: entity OG image → entity hero → site default;
- canonical: application route plus configured production origin.

Use Next.js Metadata APIs and `generateMetadata` in server routes. Metadata queries reuse cached public view models.

## Indexable URLs

- stable lowercase slugs;
- one canonical URL per page;
- unpublished and authenticated preview/admin routes use `noindex` and are excluded from sitemap;
- changed published slugs require a 301 redirect record or deployment-managed redirect; do not silently break links;
- filter/search query states are not indexable landing pages initially.

## Sitemap and robots

`app/sitemap.ts` emits Home, About, Rooms, published room details, Facilities, published facility details, and Contact with accurate `lastModified` values. Detail entries include the approved hero image. Empty listings and unpublished records are omitted. `app/robots.ts` allows the marketing site, disallows `/admin` and `/api`, and links the sitemap. Both use the server-validated `APP_URL` origin.

Robots is not an access-control mechanism; protected routes remain authenticated.

## Structured data

Use JSON-LD built from validated server data:

- one `Hotel`/`LodgingBusiness` entity with name, description, URL, logo, telephone, email, postal address, coordinates when confirmed, images, and social `sameAs` URLs;
- room detail may reference `HotelRoom`/`Room`-appropriate accommodation data only when schema semantics are verified during implementation;
- facility details may be expressed through amenity features on the hotel rather than invented standalone business types;
- breadcrumb structured data on nested routes;
- website/organization identity where non-duplicative.

Do not publish `Offer`, price range, aggregate rating, availability, or review markup unless sourced from real authoritative data and visible on the page.

Phase 10 implements one site-wide `Hotel`, `HotelRoom` on room details, and `BreadcrumbList` on listing/detail routes. Facilities stay represented by the hotel identity and visible page content rather than invented standalone business types. Unit and browser tests assert the positive types and the absence of commercial fields.

## On-page requirements

- exactly one meaningful `h1` per page;
- logical `h2`/`h3` hierarchy in section renderers and rich text;
- semantic landmarks, address, lists, and links;
- descriptive link text and image alt text;
- room/facility names and New Cairo location used naturally, never keyword-stuffed;
- important copy rendered in initial HTML, not only after client JavaScript.

## Social metadata

- Open Graph title, description, canonical URL, image dimensions/alt, site name, and appropriate type;
- Twitter/X card metadata using a large image where available;
- social images use a dedicated crop or focal point and meet provider size expectations;
- admin preview shows likely title/description/image output.

## Content quality checklist

- confirm official naming and address consistency;
- unique descriptions for every room/facility;
- replace placeholder amenity copy;
- provide useful room facts without prices;
- include genuine opening hours only when verified;
- optimize image filenames/alt for humans, not keyword repetition;
- maintain contact and social profile accuracy.

## Measurement

Connect Search Console and privacy-appropriate analytics after domain verification. Monitor index coverage, branded/non-branded queries, room/facility landing traffic, contact conversions, Core Web Vitals, 404s, and future booking handoff clicks. Analytics configuration is an adapter/config concern, not embedded throughout components.

## Phase 10 implementation notes

- Page, room, and facility social images fall back through entity OG image → entity hero → site default.
- The managed favicon is emitted through Metadata; `/rivana-icon.png` is the static fallback.
- Eight verified legacy HTML paths use permanent redirects in `next.config.ts`. `/room-studio-pool-view.html` has no approved matching record and remains a launch blocker rather than being guessed.
- Sitemap freshness is coupled to public content/media cache invalidation. Draft-only edits do not churn public caches.
- Full route evidence and production blockers are in [phase-10-seo-performance.md](./phase-10-seo-performance.md).
