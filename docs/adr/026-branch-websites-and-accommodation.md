# ADR 026 — Branch-owned websites on path-prefixed routes, and rooms and apartments in one catalog

Status: **Accepted** (2026-11-06, client decisions Q-41, Q-42, Q-43, Q-52). Extends [ADR 017](./017-multi-branch-data-ownership.md) (which kept pages and facilities global and deferred branch URLs, Q-03 and Q-04) and [ADR 006](./006-content-architecture.md) (pages become per branch). ADRs 006 and 017 stay as the record of the earlier design.

## Context

The website built in Phases 7–10 has one Home, About, and Contact page, one facility list, and one room list, at unprefixed URLs (`/rooms/[slug]`). ADR 017 planned branch ownership for rooms, prices, and reservations only. The client now wants each branch to have its own marketing content (text and images) throughout the site, a branch chooser when more than one branch is active, a branch switcher, and the chosen branch carried into listings and booking. A branch may offer guest rooms, hotel apartments, or both, booked through the same flow. Each branch shows its own location on an interactive Google Map.

## Problem

How do branches own public content without a separate implementation per branch, how do URLs carry the branch, and how do apartments fit the room catalog without misleading guests?

## Options considered

URLs:

1. **Subdomains per branch.** Not approved by the client; needs DNS access the client lacks.
2. **Unprefixed routes with the branch in a cookie.** Pages cannot be shared or indexed per branch.
3. **Path prefix `/{branchSlug}/…`.**

Apartments:

1. **A separate apartment model and booking flow.** Duplicates inventory, pricing, and reservations.
2. **Apartments as ordinary rooms with no marker.** Misleads guests and staff.
3. **One catalog with an accommodation type.**

## Decision

URL option 3 and apartment option 3.

**Routes**

- Branch pages: `/{branch}` (home), `/{branch}/about`, `/{branch}/stay` and `/{branch}/stay/{slug}` (rooms and apartments), `/{branch}/facilities` and `/{branch}/facilities/{slug}`, `/{branch}/contact`, `/{branch}/book/…`.
- `/` shows the branch chooser when two or more branches are `ACTIVE`, and redirects with `307` to the only active branch otherwise, so adding a branch needs no deploy. The chooser has brand-level content from site settings.
- Branch slugs may not collide with reserved top-level segments (`admin`, `api`, `media`, `reservations`, `book`, `sitemap.xml`, `robots.txt`, and existing legacy paths); the branch schema validates this.
- The header shows the current branch and a switcher (when more than one is active). Switching goes to the same page type at the other branch (for example `/giza/stay`), or that branch's home when the item does not exist there.
- Existing URLs (`/about`, `/contact`, `/rooms`, `/rooms/{slug}`, `/facilities/…`, and the legacy `*.html` redirects) redirect permanently (`308`) to the first branch's equivalents, created when the branch exists. Canonicals move to the branch URLs.

**Content ownership**

- `Page` gains `branchId`; the unique key becomes `(branchId, key)`. Each branch has its own Home, About, and Contact sections from the same allowlisted registry (ADR 006). The migration moves today's pages to the first branch.
- `Facility` gains `branchId`. Facility slugs stay globally unique for now (like room slugs, ADR 017).
- `SiteSettings` keeps brand-wide identity: logo variants, brand name, social links, footer and legal text, and default SEO. Contact details, address, coordinates, check-in time, map embed, and hero image move to `Branch`.
- All branches render the same templates. There is no per-branch code, layout, or theme.
- Cache tags become branch-qualified (`branch:{slug}:page:home`, `branch:{slug}:stay`, …) so one branch's edits do not invalidate another's pages.

**Accommodation**

- `Room` gains `accommodationType` (`ROOM` or `APARTMENT`, default `ROOM`) and optional `bedroomCount` and `bathroomCount`. Kitchen and living-room facts use the existing feature list. Code keeps the name `Room` for the listing; documents call it an **accommodation listing** (a room type or an apartment type).
- Inventory, prices, availability, and reservations treat both types the same: physical units (room or apartment numbers), per-unit nightly prices, branch-scoped availability.
- Guest-facing labels: navigation "Rooms & Apartments", or "Rooms" or "Apartments" when a branch offers one kind; a Room or Apartment badge on cards and detail pages; booking results say "unit" in neutral wording ("1 apartment", "2 rooms").

**Maps**

- `Branch.mapEmbedUrl`, validated with the same `https://www.google.com/maps/embed…` allowlist as today's site setting, renders the existing `LocationMap` component (lazy iframe, sandboxed, address and directions link as fallback) on the branch's Contact page and in the home page location section. The CSP keeps `frame-src https://www.google.com` only. The site-wide map setting is retired once branches carry their own.

## Rationale

Path prefixes need no DNS, are shareable and indexable, and keep the existing App Router layout. Branch-owned rows plus shared templates give each branch its own content with one implementation. One catalog keeps ADR 016's inventory proof valid for apartments.

## Consequences

- The public route tree moves under `src/app/(marketing)/[branch]/`. Every public query takes a branch. Sitemap and structured data are generated per branch (one `Hotel` entity per branch).
- Editors and Admins edit content per branch through a branch selector in the CMS (Editors have no branch scope, Q-01). Managers and Receptionists do not edit content.
- Redirects from today's URLs must be tested so search traffic and old links survive.
- Contact enquiries record the branch whose contact page sent them.

## Risks

- SEO disruption from the URL move. Mitigation: permanent redirects, canonical updates, the sitemap per branch, and the launch is the first public release of the new site anyway (Q-16).
- A future branch slug that collides with a top-level route. Mitigation: the reserved-slug check and a test.
