# M5 — Branch websites and the rooms and apartments catalog

Status: Accepted (2026-11-07)

## Outcome

Every public page now lives under its branch at `/{branch}/…`. With one active branch (today), `/` sends visitors to `/new-cairo` and the site looks as it did. When a second branch is activated, `/` becomes a chooser, the header shows a branch switcher, and every page, listing, facility, contact block, and map is that branch's own. Listings are marked Room or Apartment, with bedrooms and bathrooms for apartments. Old addresses (`/rooms`, `/about`, the legacy `*.html` pages) redirect once, permanently. Editors pick a branch in the CMS, and Admins add and edit branches. The promotion popup and the promotions area are gone. Book Now is still the honest disabled button.

Build spec: [docs/specs/0002-m5-branch-websites.md](../../specs/0002-m5-branch-websites.md), accepted by the owner after a second-model cross check (14 gaps closed before the build). Verification: [m5-verify.md](../../reviews/m5-verify.md). Review: [2026-11-07-m5-branch-websites.md](../../reviews/2026-11-07-m5-branch-websites.md).

Owner decisions taken at the start (2026-11-07):
1. Contact and map move from Settings to the branch form.
2. `/admin/promotions` is removed entirely.
3. The minimal branch admin has a list, an add form, and an edit form.
4. The branch name and switcher show only with two or more active branches.

Later, from the cross check: the default branch `new-cairo` can never be deactivated, because every old URL redirects to it.

## Scope delivered

1. **Routing**
   - [x] Pages moved under `src/app/(marketing)/[branch]/`; rooms are now `stay` and `stay/[slug]`.
   - [x] The active branch is resolved from the URL. An unknown or inactive branch gives the brand 404; an unknown path, listing, or facility inside a branch gives the branch 404 (through a `[...rest]` catch-all). Another branch's listing or facility gives a 404.
   - [x] `/`: chooser with two or more active branches, `307` with one, and a `noindex` holding page with none.
   - [x] `308` redirects from every old URL and legacy `*.html` page, each in one hop (`src/infrastructure/http/legacy-redirects.ts`, loaded by `next.config.ts` with `DEFAULT_BRANCH_SLUG`).
   - [x] Header branch name and switcher (a native disclosure; it keeps the page type or falls back to the listing or home). Shown only with two or more branches.
   - [x] Every internal link carries the branch. Book Now stays disabled and carries the branch and the listing.
2. **Content per branch**
   - [x] Public queries take the resolved branch id.
   - [x] CMS branch selector (`?branch=<slug>`) on Pages, Rooms, and Facilities. Create forms preselect the branch, and the server re-resolves the posted slug.
   - [x] Creating a branch (form or API-A2) seeds its three pages, unpublished, from the draft skeleton, in one transaction with an audit row.
   - [x] Branch form at `/admin/branches` (list, new, edit): name, slug on create, summary, status, contact, address, coordinates, times, hero image, map URL (Google allowlist), order. Online booking is shown read only as Off.
   - [x] The contact form records the branch, and the enquiry list has a branch filter (inside the caller's scope) and a branch column.
3. **Rooms and apartments**
   - [x] Accommodation type, plus bedrooms and bathrooms (apartments only), with helper text pointing to Features.
   - [x] Room or Apartment badge on cards and detail pages; apartment facts shown.
   - [x] Navigation and heading label: "Rooms & Apartments", "Rooms", or "Apartments", hidden when the branch has none.
   - [x] JSON-LD: `HotelRoom` for rooms, `Accommodation` with bedroom and bathroom counts for apartments; no offers.
4. **Maps**
   - [x] `LocationMap` takes branch data; the iframe stays lazy, sandboxed, and titled "Map showing {branch}", with the address and directions link always present.
   - [x] The branch Contact page and a home location block render it.
   - [x] The site-wide map field is retired from Settings, with phone, email, address, and coordinates (owner decision 1).
5. **SEO and caching**
   - [x] Cache tags `branch:{slug}:…` plus `branches` and `sitemap`. Every cache key names its branch, and each write expires exactly its own branch's tags.
   - [x] Sitemap per active branch, plus `/` while it is the chooser.
   - [x] Canonicals on branch URLs; one `Hotel` per branch; breadcrumbs start with the branch. With two or more branches, every page title names its branch.
6. **Popup and promotions retirement**
   - [x] Popup, client controller, styles, CMS area, overview widgets, `promotions:manage`, and the `promotion:active` tag removed.
   - [x] Promotion tests removed; a unit test guards that no public route or site component imports promotion code; E2E checks there is no popup markup.
   - [x] The `Promotion` table is kept and documented as retired.
7. **Branch API and seed**
   - [x] `ListBranches` and `ManageBranches` (and `PublicSite.branch`) back API-P1…P4 and A1…A3, which are in the OpenAPI document.
   - [x] Demo seed: `demo-giza` (inactive; `--activate-giza` to start with two branches; on a database that already has the demo site it adds only the branch, reusing the images) with three pages, two facilities, a room, and an apartment, using the demo images.

## Files added, changed, removed

Counts exclude regenerated Prisma client files: 35 new, 142 changed, 7 moved, and 15 removed.

- **New, main:**
  - migration `20261107120000_reserve_legacy_branch_slugs`;
  - `src/domain/branches/{default-branch,switch-target}.ts`, `src/domain/catalog/*`, `src/domain/content/default-sections.ts`;
  - `src/application/branches/{choose-branch,manage-branches,list-branches}.ts`;
  - `src/contracts/api/v1/branches.ts`, `src/app/api/v1/{branches,staff/branches}/**`, `src/app/api/v1/_dto/branches.ts`;
  - `src/app/(marketing)/[branch]/{layout,page,not-found,error,[...rest]/page}.tsx`;
  - `src/presentation/site/{branch-switcher,branch-chooser,branch-location,site-shell}.tsx`;
  - `src/app/admin/(protected)/branches/**`, `src/presentation/admin/branches/*`, `src/presentation/admin/content/branch-selector.tsx`;
  - `src/infrastructure/http/legacy-redirects.ts`.
- **New tests:**
  - unit: `tests/unit/domain/branch-websites.test.ts`, `tests/unit/content/page-commands.test.ts`, `tests/unit/public/sitemap.test.ts`, and `tests/support/fake-branches.ts`;
  - integration: `tests/integration/branch-api.test.ts`;
  - E2E: `tests/e2e/branch-websites.spec.ts`.
- **Moved:** the six public pages into `[branch]` (`rooms` → `stay`), and `tests/integration/promotions-enquiries.test.ts` → `enquiries.test.ts`.
- **Removed:** all promotion code, screens, and tests (see the scope list above).

## Migrations and configuration

- **Migration:** `20261107120000_reserve_legacy_branch_slugs` recreates `Branch_slug_check` with `about`, `contact`, `rooms`, and `facilities` added to the reserved list. No data changes.
  - On a copy of the development data, every count was the same before and after: rooms 5, facilities 3, pages 3, sections 15, enquiries 1, promotions 0. Migrations went from 3 to 6.
  - `prisma migrate diff`: "No difference detected."
- **Environment variables:** none new.
- **Your development database `rivana`** is still at the M3 schema (verification used a copy). Run `npm run db:deploy` to bring it to M5 (M4 and M5 migrations).

## Decisions made during the milestone (local choices only)

- **Redirect target:** the old URLs redirect to a constant (`new-cairo`), as a single static table. That is why the owner chose to make `new-cairo` impossible to deactivate.
- **Slugs:** a branch slug is fixed once created, stricter than the earlier "after first activation". A listing's or facility's branch is fixed once created.
- **New branches start inactive** (from the review), so an unfinished site never goes live.
- **Titles:** with two or more active branches, titles name the branch: Home becomes the branch name, other pages "{Page} at {branch}". With one branch, titles are unchanged.
- **Cache:** the branch lookup resolves from the cached active list, and malformed detail slugs never reach the cache.
- **Header:** with the switcher, labels never wrap; below 1280 px the switcher shows a pin icon (found and fixed during verification).
- **Coordinates** are rounded to the stored 6 decimals, so an unchanged form records no change.
- **API errors:** a bad `?type=` returns M4's standard `400 INVALID_QUERY` with field errors. The spec said `422`; the M4 wrapper contract wins.
- **Map, apartments, location:**
  - the map URL is re-checked when the branch view model is built;
  - apartments use the general `Accommodation` type;
  - the home location block is a template block, not a new section type.

No new business questions were raised.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, unit, build) | exit 0 in 17 s; unit 45 files / 905 tests (858 before M5) |
| `TEST_DATABASE_URL=…/rivana_test npm run test:integration` | 17 files / 224 tests in 22 s (204 before M5) |
| `E2E_DATABASE_URL=…/rivana_e2e_test npm run test:e2e` | 155 passed, 0 failed, 30 deliberate skips, 1.2 min |
| `CROSS_BROWSER=1 npx playwright test --project=webkit-desktop --project=webkit-tablet --project=webkit-phone` | 171 passed, 0 failed, 45 deliberate skips (WebKit desktop 38, tablet 28, phone 28, plus the Chromium admin projects they depend on) |
| `prisma migrate diff` on the migrated copy | "No difference detected." |
| Firefox | Not run: Playwright's Firefox does not launch on this Mac (macOS 27). Run it in Linux CI or by hand |

**Visual baselines.** Three were updated on purpose, each reviewed:
- the 404 on desktop and mobile: the in-branch 404 keeps the branch header, and its second link is "View where to stay";
- the room detail on mobile: the Room badge now sits above the title.

The other 13 baselines are unchanged.

## Acceptance criteria → evidence

| AC | Evidence | Status |
| --- | --- | --- |
| 1 One branch | `/` `307` → `/new-cairo`; pages unchanged; visual baselines for home, about, rooms, facilities, contact, and facility detail unchanged | met |
| 2 Redirects | Live table in [m5-verify.md](../../reviews/m5-verify.md): 14 URLs, one `308` hop each to `200`; E2E-S-4 | met |
| 3 Chooser and switcher | `chooser-*.png`, `switcher-open-desktop.png`; E2E-S-1, E2E-S-2 | met |
| 4 Isolation | Live `404`s for cross-branch slugs (pages and API); integration T-SITE-1/2, T-BR; E2E-S-3 | met |
| 5 Apartments | `apartment-detail-*.png`; label rule unit tests; E2E | met |
| 6 Map | `demo-giza-contact-map-*.png`, `…-frames-blocked-desktop.png`, `new-cairo-contact-no-map-desktop.png`; allowlist tests | met |
| 7 No popup | Architecture test, E2E, live HTML check; `/admin/promotions` gone | met |
| 8 Sitemap, canonicals, titles | Live sitemaps (one branch: 10 URLs; two: 20 with `/`); canonical check; distinct titles E2E | met |
| 9 Book Now | Disabled, with `data-branch` and `data-listing` (E2E) | met |
| 10 Accessibility | axe (serious and critical) and 320 px checks on the chooser and branch pages (E2E); measured overflow `0` | met |
| 11 Settings and branch form | Live: a branch phone change showed in the footer at once, with an audit row; `admin-settings-no-contact-desktop.png` | met |
| 12 Branch admin | `admin-branches-list-desktop.png`, `admin-branch-edit-desktop.png`; creation seeds pages and audit (integration); default branch guard (live, E2E, unit) | met |
| 13 CMS selector | `admin-rooms-branch-selector-desktop.png`, `admin-new-room-type-desktop.png`; E2E | met |
| 14 Enquiry branch | Live: an enquiry from `/new-cairo/contact` stored `new-cairo`; filter tests | met |
| 15 API | Live statuses; integration T-BR-1…4; OpenAPI freshness test | met |
| 16 Reserved slugs | Live: `INSERT … 'about'` refused on the migrated copy; unit test compares the domain list with the migration | met |

## Screenshots

In `docs/delivery/reports/screenshots/m5/`:

- **One branch:**
  - `one-branch-root-redirect-desktop.png` (`/` lands on `/new-cairo`);
  - `new-cairo-home-mobile.png`;
  - `new-cairo-contact-no-map-desktop.png`.
- **Two branches:**
  - `chooser-desktop.png`, `chooser-mobile.png`;
  - `new-cairo-home-two-branches-*.png`, `demo-giza-home-*.png`;
  - `switcher-open-desktop.png`, `header-two-branches-1280.png`, `header-two-branches-1024.png`;
  - `apartment-detail-*.png`, `demo-giza-stay-desktop.png`;
  - `demo-giza-contact-map-*.png`, `demo-giza-contact-frames-blocked-desktop.png`.
- **Admin:**
  - `admin-branches-list-desktop.png`, `admin-branch-edit-desktop.png`;
  - `admin-settings-no-contact-desktop.png`;
  - `admin-rooms-branch-selector-desktop.png`, `admin-new-room-type-desktop.png`.

Full-page screenshots leave the scroll-revealed enquiry block blank; that is the reveal animation, not missing content.

## Known limitations, risks, deferred work

- **Retired columns:** `Page.canonicalPath` still stores the path inside the branch (`/`, `/about`, `/contact`); public paths are derived. The `Promotion` table and the retired `SiteSettings` contact and map columns stay. All of this goes in a later contract migration (review follow-up).
- **Redirects:** the targets point at `new-cairo` by constant, so moving them needs a code change (and is why that branch cannot be deactivated). Trailing-slash variants of old URLs take two hops (Next's slash redirect, then the `308`).
- **Cache and sitemap:** well-formed but unknown listing and facility slugs still cache a `null` per branch, as before M5. Contact and address edits do not move any sitemap `lastmod`. Branch hero images load with one query per branch (fine for two or three branches).
- **Not built here:** booking pages, availability, and prices stay out of scope (M6–M10). The sync settings come to the branch form in M11, and the full branch admin in M12.
- **Environment:** the staff CLI prefers `DIRECT_DATABASE_URL`, which `.env` points at the development database. Set both variables when making accounts in another database. During verification two check accounts briefly landed in `rivana` this way; they were deleted at once, and `rivana` is back to its original three accounts.
- **Verification copy:** `rivana_m5_verify_test` (with `admin.check@example.test` and `editor.check@example.test`) can be dropped any time. `rivana_m4_verify_test` from M4 is still there too.

## Next milestone: not started

M6 (inventory and availability) has not started. M5 is merged into `main`; two owner requests come before M6.
