# M5 — Branch websites and the rooms-and-apartments catalog

Status: **Accepted** (2026-11-07). Build spec: [0002](../../specs/0002-m5-branch-websites.md). Evidence: [report](../reports/m5-branch-websites.md). Branch: `m5-branch-websites`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

Each branch gets its own website on shared templates: a branch chooser when two or more branches are active, a branch switcher, branch-owned pages, facilities, listings, contact details, and an interactive Google Map. Listings are clearly a **room** or an **apartment**. The promotion popup and the CMS promotions area are removed. Online booking stays off (Book Now keeps its honest disabled state).

## Read first

- ADRs [026](../../adr/026-branch-websites-and-accommodation.md), [027](../../adr/027-booking-price-composition.md) (popup retirement only), [006](../../adr/006-content-architecture.md), [017](../../adr/017-multi-branch-data-ownership.md), [009](../../adr/009-server-components.md)
- [domain/branch-model.md](../../domain/branch-model.md), [domain/content-model.md](../../domain/content-model.md), [domain/promotions.md](../../domain/promotions.md)
- [frontend/route-map.md](../../frontend/route-map.md), [frontend/seo.md](../../frontend/seo.md), [frontend/design-system.md](../../frontend/design-system.md), [frontend/component-architecture.md](../../frontend/component-architecture.md)
- [api/api-contracts.md](../../api/api-contracts.md) (API-P1–P4, API-A1–A3)
- Next.js guides: dynamic segments, `generateStaticParams` (not used for branches; pages are dynamic), `redirect`/`permanentRedirect`, `next.config` redirects, Metadata, sitemap

## Blocking questions

Decided: Q-41, Q-42, Q-43, Q-47, Q-52. Content for a second real branch is not needed (the demo seed provides a fictional one).

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`ENHANCEMENT`) | Route tree move, redirect table, cache-tag naming, CMS branch selector |
| Build | `/develop` (logic track for queries, branch API, redirects; UI track for chooser, switcher, badges, CMS fields) | Reuse existing templates; no per-branch components |
| Tests | `/test` | Update existing public E2E specs to branch URLs; delete `promotion-popup.spec.ts` |
| Failures | `/debug` | Visual baseline drift, cache invalidation misses |
| Proof | `/check verify` | One-branch and two-branch runs; redirects; map fallback |
| Review | `/check review` | Focus: SEO regressions, branch isolation in public queries, XSS in map URLs |
| After merge | `/sync` | Record the `[branch]` route convention in `AGENTS.md` |

## In scope

Public route move, chooser, switcher, redirects, per-branch content and CMS editing, accommodation type, branch maps, per-branch SEO, popup and promotions retirement, branch API, demo second branch.

## Out of scope (binding)

- Booking pages, availability, prices, or any Book Now destination (M10).
- Physical units, rates (M6).
- Branch-specific design or theme (all branches share templates).
- Subdomains.
- Dropping the `Promotion` table (a later contract migration after launch).

## Tasks

### 1. Routing (`src/app/(marketing)/[branch]/…`)

1. Move Home, About, Contact, Facilities, and facility detail pages under `[branch]`; rename the room routes to `stay` and `stay/[slug]`.
2. Branch resolution: a cached query `getActiveBranchBySlug(slug)`; unknown or inactive slug → `notFound()`. A listing or facility of another branch → `notFound()`.
3. `/` (`src/app/(marketing)/page.tsx`): two or more active branches → chooser page (brand content from `SiteSettings`, branch cards with name, city, summary, hero image); exactly one → `redirect()` (`307`) to `/{slug}`; none → a neutral holding message (no fake content).
4. Permanent redirects (`308`): `/about` → `/{first}/about`, `/contact` → `/{first}/contact`, `/rooms` → `/{first}/stay`, `/rooms/:slug` → `/{first}/stay/:slug`, `/facilities` and `/facilities/:slug` likewise, and every legacy `*.html` redirect re-pointed to the branch URL. "First" is the slug created in M4 (`new-cairo`); implement in `next.config.ts` with that slug, or in a route that reads the first branch, and document the choice in the spec.
5. Header: branch name indicator and a switcher (a native disclosure or select, keyboard accessible) shown only with two or more active branches. Switching keeps the page type (`/x/stay` → `/y/stay`); a detail page that does not exist at the other branch goes to that branch's listing or home.
6. Every internal link carries the current branch. Book Now keeps the disabled `BookingProvider` behavior and receives the branch and listing as context.

### 2. Content per branch

1. Public queries for pages, listings, and facilities take the resolved branch id.
2. CMS: a branch selector (Editor and Admin) on Pages, Rooms (listings), and Facilities; lists filter by branch; create forms preselect the current branch. The page editor edits the selected branch's Home, About, or Contact.
3. Creating a branch (API-A2) seeds its three pages from the section registry with empty, unpublished content, so editors fill them in.
4. Branch form (Admin; minimal screen at `/admin/branches/[id]`, full admin in M12): name, summary, status, contact, address, coordinates, check-in and check-out times, hero image, Google Maps embed URL (same `https://www.google.com/maps/embed` allowlist as `src/domain/settings/site-settings.ts`), sort order. `onlineBookingEnabled` stays false and read-only until M10.
5. Contact form records the branch of the page it was sent from (`ContactEnquiry.branchId`); enquiry list filters by branch.

### 3. Rooms and apartments

1. CMS listing form: "Accommodation type" (Room or Apartment), optional bedrooms and bathrooms (shown for apartments), helper text that kitchen and living facts go in Features.
2. Public: a Room or Apartment badge on cards and detail pages; apartments show bedrooms and bathrooms when set.
3. Navigation label rule: "Rooms & Apartments" when the branch has published listings of both types, "Rooms" or "Apartments" when only one, hidden when none. Page titles and headings follow the same rule.
4. JSON-LD: `HotelRoom` for rooms; `Accommodation` (or `Apartment` if the schema check passes) for apartments, still without offers or prices.

### 4. Maps

1. `LocationMap` takes branch data (`mapEmbedUrl`, address lines, coordinates) instead of site settings.
2. Branch Contact page and a location section on branch Home render it; the iframe stays lazy, sandboxed, titled "Map showing {branch name}", with the directions link and address always present.
3. Retire the site-wide map field from the settings form (column kept until a later contract migration).

### 5. SEO and caching

1. Cache tags `branch:{slug}:…` for pages, listings, facilities; branch mutations invalidate `branches` and that branch's tags only.
2. Sitemap: chooser (when shown), and every published page, listing, and facility per active branch.
3. Canonicals on branch URLs; one `Hotel` JSON-LD entity per branch with its own address and contact; breadcrumbs include the branch.

### 6. Popup and promotions retirement

1. Remove `ActivePromotion` and `PromotionPopup` from `src/app/(marketing)/layout.tsx` and delete the public component and its client controller.
2. Remove `/admin/promotions` from navigation and routes (or keep a read-only archived list if the spec chooses; no create, edit, or publish). Remove `promotions:manage` from roles.
3. Remove the `promotion:active` cache tag and dashboard promotion widgets.
4. Delete `tests/e2e/promotion-popup.spec.ts` and promotion unit and integration tests for removed code; add a test that public pages ship no promotion markup or island.
5. Keep the `Promotion` table and its migration history; document it as retired in the data model.

### 7. Branch API and seed

1. Use cases `ListBranches`, `GetBranch`, `ManageBranches`; API-P1–P4 (public), API-A1–A3 (staff).
2. Demo seed: a second fictional branch (`demo-giza`, inactive by default, switchable to active locally) with its own pages, two facilities, one room listing, and one apartment listing with images from the demo media set.

## Database impact

No new tables. Columns added in M4 are used. Optional data migration: none. `Promotion` unused.

## API impact

API-P1–P4, API-A1–A3 implemented and in the OpenAPI document.

## Acceptance criteria

1. With one active branch, `/` redirects (`307`) to `/new-cairo`, and every accepted page renders under `/new-cairo/…` with the same content as before.
2. Every URL listed in the Phase 7 and Phase 10 route inventories, including legacy `*.html` paths, reaches the branch equivalent through a single permanent redirect.
3. With two active branches, `/` shows the chooser with both branches; choosing one shows that branch's Home text and images; the switcher changes every branch-owned text and image on every page type.
4. A listing, facility, or page of branch A never appears under branch B (public queries and API), and an inactive branch's URLs return 404.
5. Apartments display an Apartment badge and their bedroom and bathroom facts; the navigation label follows the rule above.
6. Each branch's Contact page shows its interactive map; with the embed URL empty or third-party frames blocked, the address and directions link still work; a non-Google embed URL is rejected by the form.
7. No public page contains promotion popup markup or client JavaScript; `/admin/promotions` no longer offers create, edit, or publish.
8. Sitemap and canonicals contain only branch URLs of active branches and published content.
9. Book Now remains the honest disabled control on every page.
10. axe reports no serious or critical issues on the chooser and branch pages; no horizontal overflow at 320 px.

## Tests

- Unit: navigation label rule; branch switch target mapping; reserved slugs; map URL allowlist on the branch schema.
- Integration: branch-scoped public queries (T-SITE-1, T-SITE-2); branch creation seeds three pages (T-SITE-3); cache tags per branch (T-SITE-4); branch API (T-BR-1…4); listing type persisted (T-CAT-1, T-CAT-2).
- E2E: chooser and single-branch redirect (E2E-S-1); switcher keeps page type (E2E-S-2); branch content isolation with the demo branch active (E2E-S-3); redirect table (E2E-S-4); map and fallback (E2E-S-5); updated public-site, content, and visual specs on branch URLs; no popup (replaces `promotion-popup.spec.ts`).

## Evidence for the report

Redirect table with HTTP statuses; screenshots (desktop and mobile) of the chooser, a branch home for each branch, an apartment detail page, and the Contact page with and without the map; sitemap excerpt; proof the popup is gone.

## Risks

- Search ranking dip after the URL move; mitigated by single-hop permanent redirects and canonicals.
- Cache bleed between branches; covered by tests on tags.
- A large visual baseline update hides regressions; review baselines page by page.

## Handoff

Report, then stop. M6 has not started.
