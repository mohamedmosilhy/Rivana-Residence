# Phase 7 public website handoff

Status: **Accepted on 2026-09-26**
Completed: 2026-09-25
Scope: public routes, managed-content rendering, responsive images, contact enquiries, promotion pop-up, accessibility baseline, and the disabled booking boundary. Phase 8 owns visual-system polish.

## Outcome

The public website now renders the managed Home, About, Contact, room, and facility content through application queries. Public routes do not import Prisma or return draft, archived, non-ready, or rights-unconfirmed content. The shared shell provides a skip link, desktop and mobile navigation, settings-backed contact/social details, an accessible footer, error handling, and branded 404 states.

Visitors can:

- browse the published room and facility catalogues and their detail pages;
- read verified room facts, features, opening hours, and ordered galleries;
- use the contact page's address, telephone, email, map fallback, and enquiry form;
- receive clear form validation and a generic success confirmation;
- view, copy, and dismiss the single eligible promotion campaign;
- discover that online booking is not connected without being sent to a fake destination.

Published room, facility, and managed-page records now expose a **View public page** link in the CMS. Unpublished and archived records show their future address as text only.

## Decisions implemented

| Area | Implementation | Boundary |
| --- | --- | --- |
| Rendering | App Router Server Components query serializable public view models through `PublicSite`; content reads are cached under existing invalidation tags after opting into request-time rendering. | No public page imports Prisma. Client components are limited to menu state, booking explanation, contact pending/focus behavior, and the promotion dialog. |
| Images | Only `READY`, rights-confirmed media is exposed. `next/image` receives stored dimensions, focal-point object position, responsive `sizes`, and an explicit LCP preload on the leading hero. | Local optimization is restricted to `/media/**` with no query string. Missing or unapproved images are omitted rather than replaced with invented content. |
| Booking | Every booking call to action is a focusable `button` with `aria-disabled="true"`, no form/link ancestor, no destination, and an announced explanation on activation. | No rates, inventory, dates, guest search, availability, reservation data, or booking URL exists. |
| Promotions | The server returns at most one published, scheduled, highest-priority pop-up. The dialog opens after primary content is usable, closes with Escape/backdrop/button, returns focus, reports clipboard success/failure, and stores only campaign ID, version, and a seven-day dismissal expiry. | Scheduling uses the server clock. Eligibility and price are explicitly deferred to the future reservation provider. |
| Contact storage | A valid message is rate-limited, persisted first, then delivered through `ContactDelivery`. Delivery failure changes the enquiry to `DELIVERY_FAILED` without losing the message or exposing the provider error to the visitor. | `none` stores only, `outbox` is deterministic local/test delivery, and `smtp` sends plain text in production. |
| Abuse controls | HMAC render-time token, 24-hour expiry, three-second fill heuristic, hidden honeypot, strict Zod lengths/plain-text validation, and HMAC-derived throttle keys. | Raw client addresses are not stored. Proxy headers are read only when `AUTH_TRUST_PROXY_HEADERS=true`. |
| Facility paths | The verified fixture routes are `/facilities/swimming-pool` and `/facilities/fitness-room`. | No unapproved Gym alias or redirect was invented. Slugs remain CMS-owned canonical data. |

## Route inventory

The production-build E2E fixture publishes the same entity types used by the CMS. Each row was checked for HTTP 200, one visible `h1`, no horizontal overflow at desktop/mobile widths, no axe violations, and primary content in the server HTML.

| Route/template | Expected status | Source |
| --- | ---: | --- |
| `/` | 200 | Published `Page(HOME)` sections plus published room/facility queries |
| `/about` | 200 | Published `Page(ABOUT)` sections plus referenced public entities |
| `/contact` | 200 | Published `Page(CONTACT)` sections plus public site settings |
| `/rooms` | 200 | Published room catalogue |
| `/rooms/studio-with-balcony` | 200 | Published `Room` by canonical slug |
| `/rooms/deluxe-double` | 200 | Published `Room` by canonical slug |
| `/facilities` | 200 | Published facility catalogue |
| `/facilities/swimming-pool` | 200 | Published `Facility` by canonical slug |
| `/facilities/fitness-room` | 200 | Published `Facility` by canonical slug |
| Unpublished, archived, or unknown room/facility slug | 404 | Public repository returns no entity; route calls `notFound()` |
| Unknown route such as `/not-a-page` | 404 | Root not-found boundary |

If `Page(HOME)` is not published, `/` intentionally returns a quiet 200 holding page with contact guidance; it never leaks the draft. Unpublished About or Contact pages return 404.

## Contact delivery evidence

The browser suite used `CONTACT_DELIVERY=outbox`, an isolated `/tmp/rivana-e2e-outbox`, and a disposable database. Evidence contains synthetic data only.

| Scenario | Result |
| --- | --- |
| Invalid email, markup-like message, and invalid phone | Submission rejected; summary focused; fields retain input and expose linked errors |
| Valid message | Enquiry stored as `NEW`; delivery ID recorded as `outbox:<enquiry-id>`; one matching outbox JSON file created |
| Delivery adapter failure | Visitor receives the same generic success; enquiry remains stored as `DELIVERY_FAILED` for staff |
| Submission under three seconds | Generic success; no enquiry or delivery created |
| Filled honeypot | Generic success; no enquiry or delivery created |
| Sixth accepted message inside ten minutes from one client key | Rate-limited; another derived client key remains independent |
| Plain-text/header safety | Newlines are removed from the subject header; body fields remain plain text; SMTP has connection, greeting, and socket timeouts |

Production SMTP was not contacted during automated tests. Before deployment, configure and smoke-test `CONTACT_TO`, `CONTACT_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASSWORD` with the approved mailbox/domain. Use `CONTACT_DELIVERY=none` until those values are ready if inbox-only persistence is acceptable.

## Booking-boundary and link audit

Playwright inspected every visible booking control on Home and room detail pages:

- element is `BUTTON`, `type="button"`, and `aria-disabled="true"`;
- element is not inside an anchor or form;
- keyboard activation leaves the URL unchanged and announces “Online booking is not available yet”;
- no public anchor `href` contains booking, reservation, arrival, or check-in terms;
- no room page contains price, currency, per-night, availability, check-in/out, sold-out, date, number, or select controls.

This is a DOM assertion, not a screenshot-only review. The future provider remains behind `ResolveBooking` and `DisabledBookingProvider`.

## Accessibility, responsive, and failure evidence

- Axe reports zero violations on every public template at Desktop Chrome and Pixel 7 widths, on contact validation, and while the promotion dialog is open.
- The public pages have one `h1`, landmarks, labelled navigation, visible focus, and a skip link that moves focus to `main`.
- The mobile navigation is a native disclosure that works without JavaScript and also closes after navigation or Escape when hydrated.
- Home, room detail, and Contact primary content remains readable with JavaScript disabled.
- Reduced-motion CSS removes non-essential transitions/animations, and tests wait for settled animations before contrast checks.
- Unknown and unpublished content uses a real 404 response and a branded recovery link.
- Layout assertions found no horizontal overflow at the tested desktop and Pixel 7 widths; the CSS baseline starts at 320 px.

## Screenshots

Review evidence is in `docs/screenshots/`:

- Home: `phase-7-home-desktop.png`, `phase-7-home-mobile.png`
- About: `phase-7-about-desktop.png`, `phase-7-about-mobile.png`
- Rooms: `phase-7-rooms-desktop.png`, `phase-7-rooms-mobile.png`
- Room detail: `phase-7-room-detail-desktop.png`, `phase-7-room-detail-mobile.png`
- Facilities: `phase-7-facilities-desktop.png`, `phase-7-facilities-mobile.png`
- Facility detail: `phase-7-facility-detail-desktop.png`, `phase-7-facility-detail-mobile.png`
- Contact: `phase-7-contact-desktop.png`, `phase-7-contact-mobile.png`, `phase-7-contact-error-desktop.png`, `phase-7-contact-success-desktop.png`
- Shell/states: `phase-7-mobile-menu.png`, `phase-7-book-now-status-desktop.png`, `phase-7-promotion-popup-desktop.png`, `phase-7-not-found-desktop.png`, `phase-7-not-found-mobile.png`

The images are behavior/layout evidence, not Phase 8 visual approval.

## Architecture

```text
src/application/public/                    public query service and serializable view models
src/application/enquiries/submit-enquiry.ts persistence, abuse controls, delivery orchestration
src/composition/public.ts                  Prisma/email wiring, cache tags, request headers, form tokens
src/infrastructure/email/                  HMAC tokens, deterministic outbox, SMTP adapter
src/app/(marketing)/                       shell, routes, metadata, Server Actions, errors and 404
src/presentation/site/                     navigation, cards, sections, images, gallery, map, form
src/presentation/features/promotions/      shared card and public modal behavior
tests/unit/public/                         mapping, scheduling, token, validation, and component behavior
tests/integration/public-site.test.ts       real repositories, publication filters, enquiry persistence
tests/e2e/public-site.spec.ts               route, a11y, navigation, contact, SSR and booking evidence
tests/e2e/promotion-popup.spec.ts           scheduling, priority, copy fallback and dismissal behavior
```

### Public cache

| Query | Tags | Notes |
| --- | --- | --- |
| Site settings | `site-settings` | Header, footer, contact details, logo, share image |
| Managed page | `page:<key>` | Home, About, Contact |
| Room list / detail | `rooms`, `room:<slug>` | Published only |
| Facility list / detail | `facilities`, `facility:<slug>` | Published only |
| Promotion candidates | `promotion:active` | 300-second revalidation; the winner is chosen per request so start/end times are exact |

CMS Server Actions invalidate these tags with `updateTag`. The data cache persists in `.next/cache/fetch-cache` across restarts, so **any database change made outside the CMS (restore, seed, SQL, CLI import) must be followed by deleting `.next/cache/fetch-cache` and restarting the app**. The E2E web server does this before every run.

The page renderer supports all controlled Phase 5 section types: Hero, Rich text, Image and text, Gallery, Feature grid, Facts and figures, Room grid, Facility grid, and Contact block. Payloads were validated before persistence; the public renderer still treats unknown values defensively and never renders raw HTML.

## Verification

Run on 2026-09-26 with Node 22 and disposable local PostgreSQL databases:

| Check | Result |
| --- | --- |
| `npm run format:check` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 32 files, 443 tests passed |
| `npm run test:integration` | 12 files, 154 tests passed |
| `npm run build` | Passed; all public templates compiled as request-rendered routes |
| `npm run test:e2e` | 99 passed; 20 intentional viewport/project skips; 0 failed |

Playwright rebuilds, migrates, and seeds only a database whose name ends in `_test`. It runs the admin suites before public routes, then promotion tests last so a live modal cannot interfere with other flows.

## Known limits and next work

- The reference-image rights recorded in Phase 6 still need confirmation per image before real content using them can be published. Automated fixtures use confirmed test media only.
- Production SMTP credentials and a controlled real delivery smoke test remain deployment work.
- The privacy notice and final retention decision must be approved before collecting production enquiries.
- Phase 8 applies the final luxury visual system and long-content/zoom/coarse-pointer polish; this phase intentionally provides the functional responsive baseline.
- Phase 9 owns richer lightbox/carousel motion. The current gallery is a semantic list whose full-size links work with a keyboard and without JavaScript.
- Legacy WordPress URLs such as `gym.html` and `swimming-pool.html` are not redirected yet; the redirect map needs client approval (Phase 10 SEO).
- Rich-text inline marks (bold/italic/links inside paragraphs) remain plain text until the content model adds them.
- SEO sitemap/robots/structured-data completion and performance budgets remain Phase 10.

## Review findings (2026-09-26)

The Phase 7 review before Phase 8 found these issues. Each is resolved on the Phase 8 branch:

| Finding | Impact | Resolution |
| --- | --- | --- |
| The Phase 7 stylesheet rewrite deleted the base `.brand-mark` rules. | The wordmark rendered as unstyled “RivanaResidence” in the public header/footer, admin sidebar, top bar, and staff login. | Rules restored; the public site now uses the approved logo lockup. |
| The approved logo files in `design/assets/images/` were not used. | The brand was text only. | Header, footer, mobile menu, and staff login use the logo artwork. |
| Room heroes stretched 700 px photography across the full width. | Visibly soft images on desktop. | Detail heroes choose a split layout for narrow images and full-bleed only for images at least 1400 px wide. |
| Card and gallery grids were left-aligned with fixed minimum widths. | Large empty areas beside two-card rows; gallery links could force horizontal scrolling on phones. | Editorial grids, tablet spanning, and a width sweep test at 320–1440 px. |
| `gold-600` (`#9a6c34`) measured 4.34:1 on the canvas. | Small eyebrows fell just below WCAG AA. | Darkened to `#8e6230` (5.03:1); verified by `scripts/contrast-report.mts`. |
| Fixture copy was placeholder-thin. | Pages looked empty during review. | Fixture now uses the legacy site's brand copy and a third room; contact details remain test values. |

## Reviewer decision

Accepted on 2026-09-26: the client asked for this review and for Phase 8 to proceed. Public information architecture, managed-content behavior, canonical facility paths, contact workflow, promotion behavior, and the deliberately disabled booking boundary are approved.
