# Phase 9 interaction and motion handoff

Status: **Accepted on 2026-09-26**
Completed: 2026-09-26
Scope: interaction and motion layered onto the accepted Phase 8 visual system, plus four client requests made during the phase: the logo in the admin dashboard, the logo as the site favicon, white facility-tile headings, and pre-phase admin screenshots.

## Outcome

- **Home opening:** the title reveals letter by letter (the one per-character reveal the design system allows). The eyebrow, summary, and call to action rise in after it, and the hero photo settles from a slight zoom. All of this is CSS, so it plays on first paint and always ends visible.
- **Scroll depth:** the hero photo drifts at 30% of scroll speed, and the hero text eases up and fades as it leaves the screen. Scrolling itself is never intercepted.
- **Scroll reveals:** section headings rise and draw their gold eyebrow rule. Card grids, features, stats, and gallery tiles stagger in. Split and intro photographs are uncovered by a plum curtain while settling from a 1.14 zoom. Statistics count up once.
- **Page continuity:** a room or facility photo morphs from its card into the detail-page hero (View Transitions). The header stays anchored during the transition.
- **Header:** it tucks away while you read downward past 480px and returns on any upward scroll or when anything in it takes keyboard focus. A 2px gold rule shows reading progress.
- **Mobile menu:** a plum sheet slides down and the links stagger in. The toggle reads "Close" while open. The rest of the page is inert, Tab cycles inside the sheet, and Escape or a tap on the empty backdrop closes it (animated) with focus returned to the toggle. It still works without JavaScript as a `<details>` disclosure.
- **Photo viewer:** a gallery link now opens a modal viewer with labelled previous/next buttons (disabled at the ends, no wrap-around), arrow/Home/End keys, swipe, thumbnails, a caption, a "01 / 03" counter, and a polite "Photo 2 of 3: …" announcement. There is no autoplay. Photos keep their natural dimensions and are never upscaled. Without JavaScript, or with a modifier-click, each link still opens the full-size file.
- **Micro-interactions:** buttons scale slightly on press, and a gold rule sweeps under card and tile photos on hover. The contact form shows a spinner and `aria-busy` while sending.
- **Desktop submenu:** the navigation has no nested items (`SITE_LINKS` is flat), so there is no submenu to build. The existing links remain fully keyboard-operable.

## Client requests during the phase

| Request | Change | Evidence |
| --- | --- | --- |
| Screenshots of the admin dashboard before Phase 9 | 21 captures of every admin area (desktop), plus the key areas on mobile, from the seeded local site | `docs/screenshots/pre-9-admin-*.png` |
| Use the logo, not typed text, in the admin dashboard and login | `BrandMark` now renders the approved logo image: the light version on the plum sidebar and menu sheet, the dark version on the top bar and login card. The top-bar logo is now also shown on phones, where the text mark used to be hidden. | `phase-9-admin-logo-desktop.png`, `phase-9-admin-logo-mobile.png`, `phase-9-admin-logo-sheet-mobile.png`, `phase-9-admin-login-logo.png` |
| Logo as the website icon | The crest (the logo's square mark, because the full lockup is illegible at 16px) is served through Next's `app/icon.png` (512px) and `app/apple-icon.png` (180px on the canvas colour) file conventions. | `<link rel="icon">` and `<link rel="apple-touch-icon">` in every page head |
| White "Swimming Pool" / "Fitness Room" headings on the facilities page | On the listing, tiles use `<h2>`, and `.site-section h2` was repainting them plum at section-heading size. The tile rule is now scoped (`.site-tile .site-tile__title`), so the headings are white at the tile size. | `phase-9-facility-tiles.png` |

## Architecture

The design is recorded in [ADR 012](./adr/012-motion-library.md). New modules live in `src/presentation/site/motion/`:

| Module | Role |
| --- | --- |
| `motion-provider.tsx` | `LazyMotion` (strict, features loaded on demand) plus `MotionConfig reducedMotion="user"`, wrapping the marketing layout |
| `reveal.tsx` | `useReveal` hook, `Reveal`, `RevealItem`, `RevealImage` |
| `split-title.tsx` | Server-rendered letter split. The plain title stays the accessible name. |
| `hero-scroll.tsx` | `ParallaxLayer` and `ScrollFade` (scroll-linked transform/opacity) |
| `count-up.tsx` | One-time statistic count, rendered final on the server |
| `shared-element.tsx` | `<ViewTransition>` wrapper with a fallback for non-Next React |

The rules that keep content readable:

1. The server always renders content visible.
2. After hydration, `useReveal` hides an element only if its top is below 90% of the viewport and `IntersectionObserver` exists. The observer disconnects after the single reveal.
3. With reduced motion requested, nothing is hidden, parallax and header tucking are off, and CSS keyframes finish instantly with no delay.
4. Printing forces every reveal visible.

Other changed files: `gallery.tsx` (now a client component with the viewer), `mobile-menu.tsx`, `header-state.tsx`, `site-header.tsx`, `site-nav-links.tsx`, `heroes.tsx` (`morphName`, parallax), `cards.tsx`, `ornaments.tsx`, `icons.tsx` (`arrow-left`, `close`), `sections/section-renderer.tsx`, `contact-form.tsx`, `design/brand-mark.tsx`, the marketing layout, both detail pages, `globals.css` (Phase 9 block and reduced-motion reset), `app/icon.png`, and `app/apple-icon.png`. `motion` 13.4.4 is the only new dependency.

## Verification

| Check | Result |
| --- | --- |
| `npm run format:check` | Pass (the only warning is the git-ignored local `.claude/settings.local.json`) |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | 33 files, 451 tests pass (8 new in `tests/unit/public/motion.test.tsx`) |
| `npm run build` | Pass; `/icon.png` and `/apple-icon.png` are prerendered |
| `npm run test:e2e` with `E2E_DATABASE_URL=…/rivana_e2e_test` | 123 pass, 26 skipped (project-scoped skips), 0 fail. The Phase 8 visual baselines match without being regenerated. |

New Playwright coverage lives in `tests/e2e/public-site.spec.ts` under "interaction and motion":

- The viewer works fully by keyboard: open with Enter; the status announcement; Previous disabled on the first photo; ArrowRight and End; Next disabled on the last photo; Tab kept inside; Escape closes with focus returned to the opening link.
- A swipe advances the viewer on the phone profile.
- The mobile menu makes `main` inert, cycles Tab inside, closes on Escape with focus on the toggle, and closes on a backdrop tap.
- Below-the-fold cards reveal to full opacity on scroll.
- The header tucks on the way down and returns on the way up and on keyboard focus.
- With reduced motion, no element is ever hidden, the parallax layer and header stay untransformed, and the title letters are fully opaque.

### Keyboard and focus notes

- The viewer is a native modal `<dialog>`. Native modals still let Tab leave for the browser's own controls, which the new E2E test caught, so the viewer now wraps Tab explicitly.
- Disabling the previous or next button while it has focus moves focus to its partner, never to `<body>`.
- The menu restores focus to its toggle on Escape, the backdrop tap, and the toggle itself. Closing after navigation does not steal focus.
- The header always returns when a control inside it is focused, so keyboard users never tab into a hidden header.

### Pre-existing test race fixed

`promotion-popup.spec.ts` read the stored dismissal immediately after the dialog hid. A `<dialog>`'s `close` event, which records the dismissal, is dispatched in a later task, so the read was racing it. It had passed by timing luck until the page did more work at start-up. The test now polls. The app behaviour was already correct: an instrumented run showed the write happening right after `close`.

## Performance

- Every animation uses transform or opacity. The only other animated properties are the SVG `stroke-dashoffset` ray drawing, which runs once on small hero ornaments, and the Phase 8 colour transitions. Scroll handlers are passive and batched to one `requestAnimationFrame`. No layout properties change on scroll.
- Gzipped client JavaScript per public page, measured on production builds: **185 KB** (Phase 8) → **242 KB** (Phase 9). Motion's runtime accounts for about 43 KB, and its feature set loads asynchronously. Both builds exceed the aspirational 120 KB target, which Phase 10 owns.
- Phase 10 records the production Lighthouse trace and replaces the estimate with a 205 KB HTTP script-transfer baseline.

## Evidence

- Recordings: `phase-9-normal.webm` and `phase-9-reduced-motion.webm` (home load, scroll, card-to-room morph, viewer navigation).
- Stills: `phase-9-hero-letter-reveal.png` (mid-reveal), `phase-9-hero-settled.png`, `phase-9-curtain-reveal.png` (mid-curtain; the header is tucked), `phase-9-header-progress.png`, `phase-9-card-morph.png` (mid-morph), `phase-9-lightbox-desktop.png`, `phase-9-lightbox-mobile.png`, `phase-9-menu-mobile.png`, `phase-9-facility-tiles.png`, and the admin logo captures listed above.

## Acceptance checklist

| Criterion | Evidence |
| --- | --- |
| Every interaction works by keyboard and touch where applicable | E2E viewer keyboard and swipe tests; menu keyboard and backdrop tests; the existing header navigation test |
| Focus never becomes lost or incorrectly trapped | The Tab-containment assertions in the viewer and menu tests; focus-return assertions; the focus-transfer rule for disabled buttons |
| Reduced-motion users get an equivalent, immediate experience | The reduced-motion E2E test; `phase-9-reduced-motion.webm` |
| No autoplay, scroll-jacking, bounce, or decorative perpetual motion | No timers advance the gallery. Scroll is never prevented. Every ease is out-soft or in-out. The only infinite animation is the pending-submit spinner, a status indicator that stops under reduced motion. |
| Motion causes no layout shift and does not delay reading or input | Only transform and opacity animate. The unchanged Phase 8 visual baselines confirm first-viewport geometry. Content is server-visible and the letter reveal completes within about 1s. |

## Known limitations and deferred work

- **Parallax:** the design system listed "no unverified parallax". The hero drift is a deliberate, client-requested exception: transform only, capped, and off under reduced motion. Please confirm it during review.
- **Browser support:** view-transition morphs need a Chromium 125+, recent Safari, or recent Firefox browser. Elsewhere, navigation is instant, as before.
- **Screen readers:** announcements were verified through the ARIA roles and live-region text in automated tests. A manual VoiceOver/NVDA pass is still to be done in Phase 11.
- **CMS favicon:** resolved in Phase 10. Site Images now manages the favicon used by Metadata, with the static crest as fallback.
- **Bundle size:** see the Performance section.

Phase 10 is complete and ready for review. See [phase-10-seo-performance.md](./phase-10-seo-performance.md).
