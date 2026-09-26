# Phase 10 SEO, performance, and production-content handoff

Status: **Ready for review**

Completed: 2026-09-26

Scope: metadata, crawl controls, structured data, legacy redirects, cache freshness, browser icons, performance budgets, link/image checks, and a repeatable launch-content audit.

## Outcome

- Every published marketing route now has an absolute canonical URL, unique title/description fallbacks, Open Graph data, Twitter card data, locale/site identity, and sharing-image alt text.
- `sitemap.xml` is generated only from published records, includes real update timestamps and detail-page hero images, and is invalidated when public content or media changes.
- `robots.txt` allows the public site, disallows admin/API paths, and advertises the canonical sitemap and host.
- Server-rendered JSON-LD describes the verified hotel identity, room facts, and nested-route breadcrumbs. It never emits prices, offers, availability, ratings, or reviews.
- Eight verified legacy URLs permanently redirect to their canonical routes.
- Staff can select a managed browser icon in Site Images; a checked-in crest remains the fallback.
- Lighthouse CI now covers Home, a listing, a detail, and Contact under desktop and mobile profiles. All accessibility, best-practices, SEO, CLS, total-blocking-time, and script-transfer gates pass.
- `npm run audit:content` gives operators a deterministic pre-launch checklist and returns a failing status while factual approvals are missing.

## Per-route SEO matrix

| Route/template | Metadata source and fallback | Canonical | Structured data | Sitemap |
| --- | --- | --- | --- | --- |
| `/` | Home SEO fields → site defaults → site name | `/` | `Hotel` | When Home is published |
| `/about` | About SEO fields → page title/summary → site defaults | `/about` | `Hotel` | When About is published |
| `/contact` | Contact SEO fields → page title/summary → site defaults | `/contact` | `Hotel` | When Contact is published |
| `/rooms` | Managed listing title/description with site fallbacks | `/rooms` | `Hotel`, `BreadcrumbList` | When at least one room is published |
| `/rooms/[slug]` | Room SEO fields → room name/summary → site defaults; OG image → hero → site default | entity path | `Hotel`, `HotelRoom`, `BreadcrumbList` | Published rooms only; hero included as sitemap image |
| `/facilities` | Managed listing title/description with site fallbacks | `/facilities` | `Hotel`, `BreadcrumbList` | When at least one facility is published |
| `/facilities/[slug]` | Facility SEO fields → facility name/summary → site defaults; OG image → hero → site default | entity path | `Hotel`, `BreadcrumbList` | Published facilities only; hero included as sitemap image |

`APP_URL` is the single, server-validated origin for canonical, Open Graph, robots, and sitemap URLs. No host value is exposed to the browser bundle.

## Structured-data evidence

`tests/unit/public/seo.test.ts` checks Hotel identity/address/geo/social mapping, breadcrumb order, visible room facts, absolute URLs, and safe JSON serialization. Negative assertions reject `Offer`, price, availability, aggregate rating, and review fields. The E2E suite confirms the expected JSON-LD types on rendered pages and makes the same negative commercial-markup assertions.

External rich-result submission remains a deployment task because the final public HTTPS domain is not yet supplied. Google does not currently define a dedicated hotel-room rich result; the markup is semantic identity data, not a promise of a search enhancement.

## Redirect map

| Legacy URL | Permanent destination |
| --- | --- |
| `/index.html` | `/` |
| `/about.html` | `/about` |
| `/contact.html` | `/contact` |
| `/rooms.html` | `/rooms` |
| `/room-studio-balcony.html` | `/rooms/studio-with-balcony` |
| `/room-deluxe-double.html` | `/rooms/deluxe-double` |
| `/gym.html` | `/facilities/fitness-room` |
| `/swimming-pool.html` | `/facilities/swimming-pool` |

`/room-studio-pool-view.html` is deliberately not guessed: there is no approved one-to-one destination in the managed catalogue. It is a launch blocker until the client chooses a canonical replacement or confirms removal.

## Cache freshness matrix

| Successful mutation | Public tags invalidated |
| --- | --- |
| Site identity, contact, social links, logo, favicon, default sharing image | `site-settings` |
| Published page edit/publish/media change | page tag + `sitemap` |
| Published room edit, reorder, publish, slug, or media change | `rooms` + affected room tag(s) + `sitemap` |
| Published facility edit, reorder, publish, slug, or media change | `facilities` + affected facility tag(s) + `sitemap` |
| Promotion mutation | active-promotion tag only |

Draft-only edits do not invalidate shared public data. Admin, preview, session, and enquiry responses are not stored in these caches. Unit/integration expectations cover the public tag sets, while the E2E suite verifies that draft content stays out of sitemap and public routes.

## Lighthouse and Web Vitals lab report

Production build, local PostgreSQL demo data, Lighthouse 13.0.1/Chrome, one deterministic run per template. Scores are Performance / Accessibility / Best Practices / SEO; timings are milliseconds. Lighthouse is a regression signal, not field data.

| Profile | Route | Scores | LCP | CLS | TBT | JS transfer |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Desktop | Home | 99 / 100 / 100 / 100 | 827 | 0 | 0 | 205 KB |
| Desktop | Rooms | 100 / 100 / 100 / 100 | 645 | 0 | 0 | 205 KB |
| Desktop | Room detail | 99 / 100 / 100 / 100 | 666 | 0 | 0 | 205 KB |
| Desktop | Contact | 100 / 100 / 100 / 100 | 625 | 0 | 0 | 205 KB |
| Mobile | Home | 84 / 100 / 100 / 100 | 3,575 | 0 | 8 | 205 KB |
| Mobile | Rooms | 93 / 100 / 100 / 100 | 3,075 | 0 | 7 | 205 KB |
| Mobile | Room detail | 94 / 100 / 100 / 100 | 3,076 | 0 | 8 | 205 KB |
| Mobile | Contact | 94 / 100 / 100 / 100 | 3,072 | 0 | 7 | 205 KB |

The enforced gates are accessibility ≥95, best practices ≥90, SEO ≥95, CLS ≤0.1, performance warning below 80, LCP warning above 3.5 s, TBT warning above 400 ms, and script-transfer warning above 260 KB. All hard gates pass. Home mobile LCP is **75 ms over the warning budget** in this single throttled run; it is recorded as an accepted review exception, not concealed. It has zero layout shift, 8 ms blocking time, a 57 KB image transfer, and no critical-path third-party script. Field Core Web Vitals must be collected after the real host receives traffic.

The original 120 KB compressed-JS target was aspirational. The measured HTTP script transfer is 205 KB, below the agreed 260 KB regression gate but above that aspiration. The retained cost buys the accessible gallery/menu/form interactions and the approved Phase 9 motion runtime; removing it would be a product/design change rather than safe Phase 10 tuning.

## Production-content audit

Run:

```bash
npm run audit:content
```

Against the seeded review database, 7/11 checks pass: confirmed location, required pages, page descriptions, room and facility hero/alt/rights policy, promotion validity, and truthful disabled-booking messaging. The command exits with status 2 while any blocker remains.

### Explicit launch blockers

- Supply the final HTTPS `APP_URL` and verify DNS/redirect behavior.
- Replace the demo phone and `stay@rivana.example` with approved official details.
- Set the default SEO title, description, sharing image, and chosen favicon in Site Settings.
- Provide and approve the privacy notice, enquiry-retention wording, image credits, and final image-rights sign-off.
- Decide the destination for `/room-studio-pool-view.html`.
- Configure production SMTP/from/to values and perform a real delivery test.
- Verify the domain in Search Console; privacy-appropriate analytics remain optional and must not be added without approval.

These are intentionally blockers rather than fabricated defaults. The site must not be launched as production-ready until they are closed and `audit:content` passes against the production dataset.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | 34 files, 456 tests pass |
| `npm run test:integration` | 12 files, 154 tests pass against disposable PostgreSQL |
| `npm run build` | Pass; dynamic sitemap and static robots routes generated |
| Full `npm run test:e2e` | 126 pass, 29 project-scoped skips, 0 fail |
| `npm run lighthouse` | Desktop assertions processed for all four templates |
| `npm run lighthouse:mobile` | Mobile assertions processed; only the documented Home LCP warning |
| `npm audit --omit=dev` | 0 production vulnerabilities |
| Broken link/image audit | E2E crawl passes for same-origin public links and images |

The Lighthouse CLI has development-only transitive advisories; production dependencies are clean. Dependency/toolchain hardening belongs to Phase 11.

## Acceptance checklist

| Criterion | Evidence |
| --- | --- |
| Unique metadata and correct canonicals | SEO matrix plus rendered-head E2E assertions |
| Sitemap contains only indexable published routes | Dynamic sitemap implementation and draft-negative E2E assertions |
| Structured data is factual and contains no invented commerce | Unit and E2E positive/negative JSON-LD assertions |
| Performance meets budgets or has an explicit exception | Desktop/mobile table and documented 75 ms Home mobile LCP exception |
| No unnecessary critical-path third party | Lighthouse resource summary; no booking, map, analytics, or chat script |
| Content facts are approved or explicitly block launch | Repeatable audit and blocker list above |

Phase 11 has **not** started.
