# M5 verification: branch websites and the rooms and apartments catalog

Date: 2026-11-07. Spec: [0002](../specs/0002-m5-branch-websites.md). Brief: [M5](../delivery/milestones/m5-branch-websites.md).

**Verdict: PASS**, after one layout fix found during verification (below). All 16 acceptance criteria are met in the running production build. AC-10 (axe) is proven by the E2E suite; the rest were also checked by hand here.

## How it was run

- **One-branch run.** A fresh copy of the local development database `rivana` (still at the M3 schema) was restored into `rivana_m5_verify_test` and migrated with `prisma migrate deploy` (M4 and M5). The development database itself was not migrated. The production build (`next start`) ran on `127.0.0.1:3200` against the copy. Two check accounts were made with the staff CLI.
- **Two-branch run.** The same build ran against `rivana_e2e_test`, where the E2E suite had activated the fictional `demo-giza` branch through the admin screen. The data cache (`.next/cache/fetch-cache`) was cleared between the two runs, because both servers share one build folder.
- **Browser.** Headless Chromium (Playwright) at 1280×900, 1024 wide (header check), 390×844, and 320 wide (overflow check).

## Evidence by acceptance criterion

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-1 One branch | met | `/` → `307` to `/new-cairo`. Every page renders under `/new-cairo/…` with the content it had before. The header has no branch name or switcher (screenshot `new-cairo-home-mobile.png`; the desktop visual baselines for home, about, rooms, facilities, and contact are unchanged) |
| AC-2 Redirects | met | Live `curl` table below: 14 old URLs, each one `308` to a final `200` |
| AC-3 Chooser and switcher | met | With two branches `/` answers `200` with both cards (`chooser-desktop.png`, `chooser-mobile.png`). Choosing Giza opens its home. The switcher on `/new-cairo/stay/deluxe-double` links Giza to `/demo-giza/stay`, and clicking it lands there (`switcher-open-desktop.png`) |
| AC-4 Isolation | met | `/demo-giza/stay/deluxe-double`, `/new-cairo/stay/giza-family-apartment`, and API-P4 `/api/v1/branches/demo-giza/room-types/deluxe-double` all `404`. `/luxor` `404` (brand 404); `/new-cairo/nope` `404` (branch 404) |
| AC-5 Apartments | met | Apartment badge, "2 bedrooms", "2 bathrooms", "In the apartment", navigation "Rooms & Apartments" (`apartment-detail-*.png`, `demo-giza-stay-desktop.png`) |
| AC-6 Map | met | `/demo-giza/contact` embeds the Giza map, titled "Map showing Rivana Giza (demo)". With Google frames blocked, the address and the directions link stay (`demo-giza-contact-frames-blocked-desktop.png`). `new-cairo` has no map URL in the copy, so its Contact page shows the address block and the directions link (`new-cairo-contact-no-map-desktop.png`). The form refuses a non-Google URL (E2E and integration) |
| AC-7 No popup | met | No public page contains "promotion" in its HTML; `/admin/promotions` is gone from the navigation and the routes |
| AC-8 Sitemap and canonicals | met | One branch: 10 `new-cairo` URLs, no `/`. Two branches: 20 URLs including `/` and the Giza pages. Canonical on a listing is `http://127.0.0.1:3200/new-cairo/stay/studio-with-balcony`. JSON-LD has one `Hotel` per branch and `HotelRoom` / `Accommodation` for listings |
| AC-9 Book Now | met | Still the disabled button, with `data-branch` and `data-listing` set |
| AC-10 Accessibility | met | axe on the chooser, branch pages, apartment detail, and branch admin: no serious or critical issues (E2E). No horizontal overflow at 320 px on the chooser (measured `0`) |
| AC-11 Settings and branch form | met | Settings has no contact or map fields and shows the branch note (`admin-settings-no-contact-desktop.png`). A phone change on the branch form showed in the public footer at once (`+20 2 1234 5678` → `+20 2 5555 0000`), with one `branch.updated` audit row by the staff member |
| AC-12 Branch admin | met | List, edit, and add screens (`admin-branches-list-desktop.png`, `admin-branch-edit-desktop.png`). Deactivating `new-cairo` is refused with the field message. Create with pages and audit: E2E and integration |
| AC-13 CMS selector | met | Rooms list and Add room show the branch selector (`admin-rooms-branch-selector-desktop.png`, `admin-new-room-type-desktop.png`); E2E filters Giza listings |
| AC-14 Enquiry branch | met | An enquiry sent from `/new-cairo/contact` was stored with branch `new-cairo`; the enquiry list shows the Branch column, and the older enquiry shows "–" |
| AC-15 API | met | P1 `200` (one branch), P2 unknown `404`, P3 `200` with type and `detailUrl`, bad `type` `400 INVALID_QUERY`, A1 signed out `401`, A2 cross-site `403`. The full A1–A3 matrix is in the integration suite |
| AC-16 Reserved slugs | met | On the migrated copy, `INSERT … slug 'about'` fails `Branch_slug_check` |

## Redirect table (live, one-branch copy)

| Old URL | Status | Location | Final |
| --- | --- | --- | --- |
| `/about` | 308 | `/new-cairo/about` | 200 |
| `/contact` | 308 | `/new-cairo/contact` | 200 |
| `/rooms` | 308 | `/new-cairo/stay` | 200 |
| `/rooms/studio-with-balcony` | 308 | `/new-cairo/stay/studio-with-balcony` | 200 |
| `/facilities` | 308 | `/new-cairo/facilities` | 200 |
| `/facilities/swimming-pool` | 308 | `/new-cairo/facilities/swimming-pool` | 200 |
| `/index.html` | 308 | `/new-cairo` | 200 |
| `/about.html` | 308 | `/new-cairo/about` | 200 |
| `/contact.html` | 308 | `/new-cairo/contact` | 200 |
| `/rooms.html` | 308 | `/new-cairo/stay` | 200 |
| `/room-studio-balcony.html` | 308 | `/new-cairo/stay/studio-with-balcony` | 200 |
| `/room-deluxe-double.html` | 308 | `/new-cairo/stay/deluxe-double` | 200 |
| `/gym.html` | 308 | `/new-cairo/facilities/fitness-room` | 200 |
| `/swimming-pool.html` | 308 | `/new-cairo/facilities/swimming-pool` | 200 |
| `/` | 307 | `/new-cairo` | 200 |

## Migration on a copy of the development data

Before → after: rooms 5 → 5, facilities 3 → 3, pages 3 → 3, sections 15 → 15, enquiries 1 → 1, promotions 0 → 0, migrations 3 → 6. One branch, `new-cairo`, carries the settings' city and phone.

## Found during verification

1. **Crowded header with two branches (fixed).** On pages labelled "Rooms & Apartments", the header wrapped "Rivana Giza (demo)" and "Book now" onto two lines at 1280 px, and squeezed the logo at 1024 px. The fix:
   - the header button and switcher never wrap;
   - with a switcher, the header grid keeps the logo's own width;
   - nav labels never wrap, with a slightly tighter gap below 1280 px;
   - below 1280 px the switcher shows a pin icon, with the branch name kept for screen readers.

   Measured afterwards: one line at 1280 and at 1024, no overflow (`header-two-branches-1280.png`, `header-two-branches-1024.png`). The one-branch header is unchanged.
2. **Staff CLI and `DIRECT_DATABASE_URL` (environment).** `npm run staff` prefers `DIRECT_DATABASE_URL`, which `.env` points at the development database. The first two check accounts therefore landed in `rivana`. They were deleted right away (`rivana` is back to its original three accounts), then made again with both variables set. This is not new behavior; it is noted for whoever runs verification next.

## For /check review

- Full-page screenshots leave scroll-revealed sections blank (the enquiry block on Contact pages). That is the reveal animation, not missing content.
- The 404 for an unknown branch uses the brand shell (no navigation); inside a branch it keeps the branch header.
