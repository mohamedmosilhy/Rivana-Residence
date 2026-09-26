# Performance

## Targets

At the 75th percentile on representative mobile traffic, target:

- LCP ≤ 2.5s;
- INP ≤ 200ms;
- CLS ≤ 0.1;
- accessible usable content even when optional motion or third-party services fail.

Set per-route budgets during implementation rather than optimizing only a global Lighthouse score.

## Rendering and JavaScript

- Server Components render all primary public content.
- Client JavaScript is limited to navigation, galleries/lightbox, forms, upload UI, and progressive motion.
- Do not hydrate room/facility grids merely for hover effects.
- Dynamically load heavy admin editors/media dialogs and any future booking widget.
- Prefer CSS transitions and native controls over animation/form packages where behavior is simple.
- Run bundle analysis before launch and block unexplained large client dependencies.

## Images

- Use `next/image` for managed content with stored width/height and meaningful `sizes`.
- Hero image uses priority/preload only when it is the actual LCP element; do not priority-load gallery images.
- Lazy-load below-fold media and reserve aspect ratios to prevent layout shift.
- Use object-position from focal-point metadata.
- Let the image pipeline negotiate AVIF/WebP with quality tested against hotel photography.
- Upload originals within limits; generate approved delivery variants during finalization or through the application image pipeline and store them in the persistent media root, never in PostgreSQL.
- Avoid enlarging the reference's 700×466 room images beyond a credible rendered size.
- Gallery thumbnails and detail images must not download identical oversized sources unnecessarily.

## Fonts

- Use `next/font/local` for confirmed licensed Marcellus/Jost files.
- Subset glyph ranges and preload only the critical weights.
- Avoid loading unused Lato/Oswald if final comparison shows Jost can fill those roles.
- Choose fallback metrics to minimize layout shift and use `font-display: swap` behavior through Next font handling.

## Caching

- Cache published settings/pages/entities with precise content tags.
- Revalidate relevant tags after successful CMS changes.
- Public media uses long immutable cache headers because replacement creates new object keys.
- HTML/cache freshness should allow content updates within seconds after publish.
- Admin pages, sessions, previews, and enquiries are dynamic/no-store.
- Avoid caching personalized/authenticated output into shared public caches.

## Database

- Fetch DTO projections rather than whole relation graphs.
- Index public status/order/slug access paths and admin enquiry/media filters.
- Avoid N+1 gallery/media reads through deliberate includes or repository queries.
- Use pooled runtime connections and a direct migration connection when the provider requires it.
- Observe slow queries before adding caches or denormalization.

## Third parties

- Self-host critical fonts/icons.
- Lazy-load the map after consent/interaction or show a static location panel/link first.
- Future booking scripts load on user intent where provider constraints permit.
- Each analytics/chat/embed dependency needs a performance, privacy, and failure-mode review.
- The reference's floating chat button is not included unless a real provider/use case is approved.

## CSS and motion

- Central tokens and Tailwind generation avoid duplicated style bundles.
- Animate transform/opacity only; avoid layout-triggering scroll animations.
- Intersection observers disconnect after reveal.
- Reduced-motion users get immediate content.
- Phase 9: `motion` (ADR 012) adds about 43 KB gzipped to public pages, and its animation features load asynchronously. Its pre-Phase-10 build estimate was 242 KB gzipped per public page.
- No autoplay video/carousel in the initial release.

## Monitoring and budgets

Track Web Vitals by route template (Home, listing, detail, admin) and browser/device category without storing sensitive form data. Initial production budgets to validate in Phase 10:

- public route initial client JS: aim under 120 KB compressed, with exceptions justified;
- home critical image transfer: aim under 300 KB at common mobile viewport;
- no unexpected CLS from fonts/images/header;
- no third-party booking/map script in the initial critical path.

Use Lighthouse CI as a regression signal and real-user metrics as the production truth.

## Phase 10 measured baseline

Lighthouse 13.0.1 ran the production build on Home, Rooms, a room detail, and Contact under desktop and mobile throttling. Accessibility, best practices, and SEO score 100 on every route. Desktop performance is 99–100; mobile is 84–94. CLS is 0 and total blocking time is 0–8 ms throughout. Script transfer is 205 KB on each measured route, below the enforced 260 KB regression gate but above the original 120 KB aspiration.

The 120 KB figure is therefore an approved exception pending a product-level decision to remove the accessible viewer/menu/form behavior or the Phase 9 motion runtime. No booking, map, analytics, chat, or other third-party script runs in the critical path.

Mobile LCP is about 3.07 s on Rooms, room detail, and Contact. Home measured 3.575 s—75 ms over the 3.5 s lab-warning budget—with zero CLS, 8 ms TBT, and only 57 KB of image transfer. Treat this as a documented review exception and validate it with field Core Web Vitals on the final host. The full per-route table is in [phase-10-seo-performance.md](./phase-10-seo-performance.md).
